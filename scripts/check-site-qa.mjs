import assert from 'node:assert/strict';
const api = 'http://127.0.0.1:4000/api';
// The development watcher may still be restarting after a saved file.
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const health = await fetch(`${api}/health`, { signal: AbortSignal.timeout(1000) });
    if (health.ok) break;
  } catch { /* Try after the watch process has rebound its local port. */ }
  await new Promise((resolve) => setTimeout(resolve, 750));
}
async function json(path) {
  const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, path);
  return response.json();
}
const discover = await json('/discover?lang=ru');
for (const key of ['spotlights', 'topAiring', 'thisSeason', 'allTimeTop', 'mostPopular', 'trendingNow', 'trendingMonth', 'upcoming']) {
  const items = discover[key] ?? [];
  assert.ok(items.every((a) => !/^(?:r\+|rx)/i.test((a.rating ?? '').trim())), key);
  console.log(JSON.stringify({ section: key, items: items.length, adult: 0 }));
}
assert.deepEqual(await json('/payments/plans'), { available: false, plans: [] });
console.log(JSON.stringify({ mulenpay: 'disabled without merchant configuration' }));
const clips = await json('/hero-clips');
console.log(JSON.stringify({ preparedHeroClips: Object.keys(clips).length }));
for (const path of ['/', '/browse', '/browse?page=2', '/browse?genres=1', '/anime/5114-fullmetal-alchemist-brotherhood', '/anime/57555-chainsaw-man-movie-reze-hen', '/page-that-does-not-exist']) {
  const response = await fetch(`${api}/seo/page${path}`, { signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  const title = /<title>(.*?)<\/title>/s.exec(html)?.[1];
  const canonical = /<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i.exec(html)?.[1];
  if (!title || !/<h1[\s>]/i.test(html)) console.log(JSON.stringify({ path, status: response.status, title, preview: html.slice(0, 300) }));
  assert.ok(title && /<h1[\s>]/i.test(html), path);
  if (path === '/page-that-does-not-exist') assert.equal(response.status, 404);
  else assert.equal(response.status, 200, path);
  if (path === '/browse?page=2') assert.ok(canonical?.endsWith('/browse?page=2'));
  if (path === '/browse?genres=1') assert.match(html, /name="robots"[^>]*content="noindex/);
  if (path.includes('/57555-')) assert.match(html, /"@type":"Movie"/);
  console.log(JSON.stringify({ path, status: response.status, title, canonical }));
}
const sitemap = await fetch(`${api}/seo-files/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
assert.equal(sitemap.status, 200);
assert.match(await sitemap.text(), /sitemap-anime-2.xml/);
console.log(JSON.stringify({ sitemap: 'valid index with catalogue partitions' }));
