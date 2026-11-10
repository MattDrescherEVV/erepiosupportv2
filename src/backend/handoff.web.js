import { Permissions, webMethod } from 'wix-web-module';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';
import { grantHubAccess } from 'backend/hubAccess';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handoffFailed = () => new Error('Handoff failed');

export const exchangeHandoffToken = webMethod(Permissions.Anyone, async (token) => {
  if (typeof token !== 'string' || token.length < 20) {
    throw handoffFailed();
  }

  try {
    const testEnabled = await elevatedGetSecretValue('ErepioHandoffTestEnabled');

    if (testEnabled.value !== 'true') {
      throw handoffFailed();
    }

    const [apiUrl, handoffSecret] = await Promise.all([
      elevatedGetSecretValue('ErepioApiUrl'),
      elevatedGetSecretValue('ErepioHandoffSecret')
    ]);

    if (typeof apiUrl.value !== 'string' || !apiUrl.value.startsWith('https://')
      || typeof handoffSecret.value !== 'string' || !handoffSecret.value) {
      throw handoffFailed();
    }

    const response = await fetch(`${apiUrl.value.replace(/\/+$/, '')}/api/support-hub/wix/handoff/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wix-Handoff-Secret': handoffSecret.value
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw handoffFailed();
    }

    const result = await response.json();
    const email = result && result.user && typeof result.user.email === 'string'
      ? result.user.email.trim().toLowerCase()
      : '';

    if (!result || result.authorized !== true || !EMAIL_PATTERN.test(email)) {
      throw handoffFailed();
    }

    const sessionToken = await grantHubAccess(email);

    return { sessionToken };
  } catch (error) {
    throw handoffFailed();
  }
});
