import { Permissions, webMethod } from 'wix-web-module';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';
import { grantHubAccess } from 'backend/hubAccess';

const elevatedGetSecretValue = elevate(secrets.getSecretValue);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handoffFailed = (reason) => {
  // Logs a reason code only: never the token, secrets, or response body.
  console.error('Handoff failed:', reason || 'unknown');
  return new Error('Handoff failed');
};

export const exchangeHandoffToken = webMethod(Permissions.Anyone, async (token) => {
  if (typeof token !== 'string' || token.length < 20) {
    throw handoffFailed('bad_token_format');
  }

  try {
    const testEnabled = await elevatedGetSecretValue('ErepioHandoffTestEnabled');

    if (testEnabled.value !== 'true') {
      throw handoffFailed('test_flag_not_true');
    }

    const [apiUrl, handoffSecret] = await Promise.all([
      elevatedGetSecretValue('ErepioApiUrl'),
      elevatedGetSecretValue('ErepioHandoffSecret')
    ]);

    if (typeof apiUrl.value !== 'string' || !apiUrl.value.startsWith('https://')
      || typeof handoffSecret.value !== 'string' || !handoffSecret.value) {
      throw handoffFailed('bad_url_or_secret_config');
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
      throw handoffFailed(`php_http_${response.status}`);
    }

    const result = await response.json();
    const email = result && result.user && typeof result.user.email === 'string'
      ? result.user.email.trim().toLowerCase()
      : '';

    if (!result || result.authorized !== true || !EMAIL_PATTERN.test(email)) {
      throw handoffFailed('php_not_authorized_or_no_email');
    }

    const sessionToken = await grantHubAccess(email);

    return { sessionToken };
  } catch (error) {
    if (error && error.message === 'Handoff failed') {
      throw error;
    }
    // Only fixed reason codes are logged; raw exception messages could carry
    // URLs, emails or other request details.
    const STEP_CODE = /^(grant|member)_[a-z_]+$/;
    const reason = error && typeof error.message === 'string' && STEP_CODE.test(error.message)
      ? error.message
      : `exception_${error && typeof error.name === 'string' ? error.name : 'unknown'}`;
    throw handoffFailed(reason);
  }
});
