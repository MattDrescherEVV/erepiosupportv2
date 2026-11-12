import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { STATIC_HELP_PAGES } from 'public/helpSearchPages';

// Builds the help-site search index: every item in the Guides collection (plus the
// text of its Guide Steps) and the hand-written static pages in public/helpSearchPages.js.
// The Help Search page sends this index to its results embed, which ranks results
// in the browser so typing is instant.
//
// Wix Site Search can't be used here: it only indexes pages that search engines can
// crawl, and every page on this site is members-only.

const GUIDES = 'Guides';
const GUIDE_STEPS = 'GuideSteps';
const AUTH = { suppressAuth: true };
const CACHE_MS = 5 * 60 * 1000;
const MAX_BODY = 20000;

let cache = null;
let cacheAt = 0;

// Collects plain text from a Rich Text (HTML string) or Rich Content (Ricos JSON) field.
function toText(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value
      .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  if (Array.isArray(value)) return value.map(toText).join(' ');
  if (typeof value === 'object') {
    const own = value.textData && typeof value.textData.text === 'string' ? value.textData.text : '';
    return [own, toText(value.nodes)].join(' ');
  }
  return '';
}

function clean(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return max && s.length > max ? s.slice(0, max) : s;
}

// Dynamic pages store the item's page URL in a field named like "link-guides-title".
function guidePath(item) {
  const key = Object.keys(item).find(k => k.toLowerCase().startsWith('link-guides'))
    || Object.keys(item).find(k => k.startsWith('link-'));
  const url = key ? item[key] : '';
  return typeof url === 'string' && url.startsWith('/') ? url : '';
}

async function queryAll(collection, sortField) {
  const items = [];
  let query = wixData.query(collection).limit(1000);
  if (sortField) query = query.ascending(sortField);
  let page = await query.find(AUTH);
  items.push(...page.items);
  while (page.hasNext() && items.length < 5000) {
    page = await page.next();
    items.push(...page.items);
  }
  return items;
}

async function buildIndex() {
  const docs = [];
  const titles = new Set();

  // Static pages first: they are the pages the home-page cards link to today.
  for (const p of STATIC_HELP_PAGES) {
    titles.add(p.title.toLowerCase());
    docs.push({ t: p.title, c: p.category, d: p.description, b: p.keywords, u: p.path });
  }

  let guides = [];
  let steps = [];
  try {
    [guides, steps] = await Promise.all([queryAll(GUIDES), queryAll(GUIDE_STEPS, 'order')]);
  } catch (error) {
    console.error('Help search: CMS query failed', error && (error.code || error.name));
  }

  const stepText = new Map();
  for (const s of steps) {
    const guideId = s.guide && typeof s.guide === 'object' ? s.guide._id : s.guide;
    if (!guideId) continue;
    const text = [s.title, toText(s.description), toText(s.checklist), toText(s.tip)].join(' ');
    stepText.set(guideId, (stepText.get(guideId) || '') + ' ' + text);
  }

  for (const g of guides) {
    const title = clean(g.title, 200);
    const path = guidePath(g);
    if (!title || !path || titles.has(title.toLowerCase())) continue;
    titles.add(title.toLowerCase());
    const body = [toText(g.guideContent), toText(g.tip), stepText.get(g._id) || ''].join(' ');
    docs.push({
      t: title,
      c: clean(toText(g.audience), 60) || 'Guides',
      d: clean(toText(g.description), 400),
      b: clean(body, MAX_BODY),
      u: path
    });
  }

  return docs;
}

export const getHelpSearchIndex = webMethod(Permissions.SiteMember, async () => {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_MS) {
    cache = await buildIndex();
    cacheAt = now;
  }
  return cache;
});
