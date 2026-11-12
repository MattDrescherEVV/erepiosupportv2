import { authentication } from 'wix-members-frontend';
import { session } from 'wix-storage-frontend';
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';

let loggingOut = false;
let lastActivityWrite = 0;

async function endHubSession() {
  if (loggingOut) return;
  loggingOut = true;

  for (const key of ['hubStart', 'hubLastSeen']) {
    try {
      session.removeItem(key);
    } catch {
      console.error('Hub session storage unavailable');
    }
  }

  try {
    await authentication.logout();
  } catch {
    console.error('Hub session logout failed');
  }
  wixLocationFrontend.to('https://www.erepio.info/');
}

function recordActivity(force = false) {
  if (loggingOut || wixLocationFrontend.path.join('/') === 'hubauth') return;

  const now = Date.now();
  try {
    const start = Number(session.getItem('hubStart'));
    const lastSeen = Number(session.getItem('hubLastSeen'));
    if (authentication.loggedIn()
      && (!Number.isFinite(start) || start <= 0 || start > now
        || !Number.isFinite(lastSeen) || lastSeen <= 0 || lastSeen > now
        || now - start > 2 * 60 * 60 * 1000
        || now - lastSeen > 15 * 60 * 1000)) {
      void endHubSession();
      return;
    }

    if (force || now - lastActivityWrite >= 60 * 1000) {
      session.setItem('hubLastSeen', String(now));
      lastActivityWrite = now;
    }
  } catch {
    void endHubSession();
  }
}

// Site paths only (e.g. "/create-a-plan"); blocks external URLs and javascript: links.
const SAFE_PATH = /^\/[A-Za-z0-9\-_/]*$/;

// Header search box (HTML embed #html2). Enter sends {erepioSearch: query};
// we open the Help Search page with the query in the URL.
function wireHeaderSearch() {
  let box;
  try {
    box = $w('#html2');
  } catch {
    return;
  }
  if (!box || typeof box.onMessage !== 'function') return;

  box.onMessage(event => {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;

    if (typeof data.erepioSearch === 'string') {
      const q = data.erepioSearch.trim().slice(0, 100);
      wixLocationFrontend.to(q ? `/help-search?q=${encodeURIComponent(q)}` : '/help-search');
    } else if (typeof data.erepioGo === 'string' && SAFE_PATH.test(data.erepioGo)) {
      wixLocationFrontend.to(data.erepioGo);
    }
  });
}

$w.onReady(function () {
  if (wixWindowFrontend.rendering.env !== 'browser'
    || wixLocationFrontend.path.join('/') === 'hubauth') return;

  wireHeaderSearch();
  recordActivity(true);
  if (loggingOut) return;

  $w('*').forEach(element => {
    for (const event of ['onClick', 'onMouseIn', 'onKeyPress', 'onChange']) {
      if (typeof element[event] === 'function') {
        element[event](() => recordActivity());
      }
    }
  });
});
