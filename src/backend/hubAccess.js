import wixData from 'wix-data';
import { authorization, authentication, members } from 'wix-members-backend';

// Wix member role "Erepio Hub Access" (Contacts > Site Member Access > Role ID).
// Every Hub page is restricted to this role; only a verified Erepio handoff assigns it.
export const HUB_ROLE_ID = 'ca9842b0-3d22-41cd-8161-e5654e50f5c5';

// Admin-only collection that records when each member was granted the role.
export const GRANTS_COLLECTION = 'HubAccessGrants';

// How long one handoff grants access. The expiry job runs hourly, so actual
// access ends between GRANT_TTL_MINUTES and GRANT_TTL_MINUTES + 60 minutes.
export const GRANT_TTL_MINUTES = 60;

const AUTH = { suppressAuth: true };

// Runs one grant step and rethrows a fixed reason code if it fails.
// Logs the step code plus Wix's error code/name only: never the email or tokens.
async function step(code, fn) {
  try {
    return await fn();
  } catch (error) {
    const detail = error && (error.code || error.name) ? String(error.code || error.name) : 'unknown';
    console.error('Grant step failed:', code, detail);
    throw new Error(code);
  }
}

async function findMemberByEmail(email) {
  const result = await members.queryMembers()
    .eq('loginEmail', email)
    .limit(1)
    .find(AUTH);
  return result.items.length ? result.items[0] : null;
}

/**
 * Logs the verified Erepio user in to Wix and grants the Hub role.
 * Only called after Erepio PHP has confirmed the handoff token.
 * Returns a Wix session token for applySessionToken().
 *
 * Order matters: the member must exist, be approved and hold the Hub role
 * BEFORE the session token is generated, so the session the browser receives
 * already has access to Support Home.
 */
export async function grantHubAccess(email) {
  let member = await step('member_lookup_failed', () => findMemberByEmail(email));

  if (!member) {
    // First visit: generateSessionToken creates the member with a random password.
    await step('grant_create_member_failed', () => authentication.generateSessionToken(email));
    member = await step('member_lookup_failed', () => findMemberByEmail(email));
  }

  if (!member || !member._id) {
    throw new Error('member_lookup_failed');
  }

  if (member.status === 'BLOCKED') {
    throw new Error('member_blocked');
  }

  // Site signup requires manual approval, so a first-time member starts PENDING.
  // A verified Erepio handoff is the approval.
  if (member.status === 'PENDING' || member.status === 'APPLICANT') {
    await step('grant_approve_failed', () => authentication.approveByEmail(email));
  }

  await step('grant_assign_role_failed', () => authorization.assignRole(HUB_ROLE_ID, member._id, AUTH));

  await step('grant_record_failed', () => wixData.save(GRANTS_COLLECTION, {
    _id: member._id,
    memberId: member._id,
    grantedAt: new Date()
  }, AUTH));

  return step('grant_session_token_failed', () => authentication.generateSessionToken(email));
}

/**
 * Scheduled job (see jobs.config): removes the Hub role from every grant
 * older than GRANT_TTL_MINUTES. After that the member sees Restricted Access
 * until they come back through Erepio's Help / Feedback button.
 */
export async function expireHubAccess() {
  const cutoff = new Date(Date.now() - GRANT_TTL_MINUTES * 60 * 1000);
  let removed = 0;

  // Re-query after each batch because removals shift result pages.
  for (let batch = 0; batch < 50; batch += 1) {
    const page = await wixData.query(GRANTS_COLLECTION)
      .lt('grantedAt', cutoff)
      .limit(100)
      .find(AUTH);

    if (!page.items.length) {
      break;
    }

    for (const grant of page.items) {
      try {
        await authorization.removeRole(HUB_ROLE_ID, grant.memberId, AUTH);
      } catch (error) {
        // Role may already be gone (member deleted or role removed manually).
        console.warn('removeRole failed', grant.memberId);
      }
      await wixData.remove(GRANTS_COLLECTION, grant._id, AUTH);
      removed += 1;
    }
  }

  return { removed };
}
