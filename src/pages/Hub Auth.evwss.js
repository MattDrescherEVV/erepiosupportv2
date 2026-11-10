import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import { authentication } from '@wix/site';
import { exchangeHandoffToken } from 'backend/handoff.web';

let initialized = false;

$w.onReady(async function () {
  if (wixWindowFrontend.rendering.env !== 'browser' || initialized) {
    return;
  }

  initialized = true;

  try {
    const token = wixLocationFrontend.query.token;
    wixLocationFrontend.queryParams.remove(['token']);

    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('Access denied');
    }

    const result = await exchangeHandoffToken(token);

    if (!result || typeof result.sessionToken !== 'string' || !result.sessionToken.trim()) {
      throw new Error('Access denied');
    }

    await authentication.applySessionToken(result.sessionToken);
    wixLocationFrontend.to('https://www.erepio.info/');
  } catch (error) {
    // No valid handoff: send the visitor to the Hub, where Wix's server-side
    // role check withholds the page and shows the Restricted Access screen.
    wixLocationFrontend.to('https://www.erepio.info/');
  }
});
