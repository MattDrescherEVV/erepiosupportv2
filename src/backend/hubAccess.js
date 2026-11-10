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
 */
export async function grantHubAccess(email) {
  // Creates the member (random password) if this email has never been seen.
  let sessionToken = await authentication.generateSessionToken(email);

  const member = await findMemberByEmail(email);
  if (!member || !member._id) {
    throw new Error('Member lookup failed');
  }

  if (member.status === 'BLOCKED') {
    throw new Error('Member blocked');
  }

  // Site signup requires manual approval, so a first-time member starts PENDING.
  // A verified Erepio handoff is the approval.
  if (member.status === 'PENDING' || member.status === 'APPLICANT') {
    sessionToken = await authentication.approveByEmail(email);
  }

  await authorization.assignRole(HUB_ROLE_ID, member._id, AUTH);

  await wixData.save(GRANTS_COLLECTION, {
    _id: member._id,
    memberId: member._id,
    grantedAt: new Date()
  }, AUTH);

  return sessionToken;
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
