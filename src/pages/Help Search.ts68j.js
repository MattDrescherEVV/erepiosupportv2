import wixLocationFrontend from 'wix-location-frontend';
import { getHelpSearchIndex } from 'backend/helpSearch.web';
import { STATIC_HELP_PAGES } from 'public/helpSearchPages';

// Help Search page (/help-search). The HTML embed #searchResults draws the search
// box and results; this code gives it the index and the ?q= query, and handles
// clicks on results.

const SAFE_PATH = /^\/[A-Za-z0-9\-_/]*$/;

const fallbackIndex = () => STATIC_HELP_PAGES.map(p => ({
  t: p.title, c: p.category, d: p.description, b: p.keywords, u: p.path
}));

$w.onReady(async function () {
  const frame = $w('#searchResults');
  let index = null;
  let frameReady = false;

  const currentQuery = () => String(wixLocationFrontend.query.q || '').slice(0, 100);

  const send = () => {
    if (frameReady && index) {
      frame.postMessage({ type: 'erepio-search-init', q: currentQuery(), index });
    }
  };

  frame.onMessage(event => {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'erepio-search-ready') {
      frameReady = true;
      send();
    } else if (typeof data.erepioGo === 'string' && SAFE_PATH.test(data.erepioGo)) {
      wixLocationFrontend.to(data.erepioGo);
    } else if (typeof data.erepioQuery === 'string') {
      // Keep the URL in sync so results can be bookmarked or shared.
      const q = data.erepioQuery.trim().slice(0, 100);
      if (q) wixLocationFrontend.queryParams.add({ q });
      else wixLocationFrontend.queryParams.remove(['q']);
    }
  });

  // A new search from the header while already on this page.
  wixLocationFrontend.onChange(() => {
    if (frameReady && index) frame.postMessage({ type: 'erepio-search-query', q: currentQuery() });
  });

  try {
    index = await getHelpSearchIndex();
  } catch (error) {
    console.error('Help search index failed', error && (error.code || error.name));
    index = fallbackIndex();
  }
  send();
});
