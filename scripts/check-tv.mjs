import assert from 'node:assert/strict';

const base = 'http://localhost:5173';
const tv = { 'user-agent': 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 Chrome/69.0 TV Safari/537.36' };
for (const path of ['/', '/anime/35062-mahoutsukai-no-yome']) {
  const res = await fetch(base + path, { headers: tv, redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), path === '/' ? '/tv' : '/tv/anime/35062');
  const seo = await fetch('http://localhost:4000/api/seo/page' + path, { headers: tv, redirect: 'manual' });
  assert.equal(seo.status, 302);
  assert.equal(seo.headers.get('location'), res.headers.get('location'));
  assert.match(seo.headers.get('cache-control'), /private/);
}
const optOut = await fetch(base + '/?tv=0', { headers: tv, redirect: 'manual' });
assert.equal(optOut.status, 200);
assert.match(optOut.headers.get('set-cookie'), /as_full_site=1/);
assert.equal((await fetch(base + '/', { headers: { ...tv, cookie: 'as_full_site=1' }, redirect: 'manual' })).status, 200);
const html = await (await fetch(base + '/tv?q=' + encodeURIComponent('<script>alert(1)</script>'))).text();
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>alert(1)</script>'));
const catalog = await (await fetch(base + '/tv')).text();
assert.equal((catalog.match(/class="card"/g) || []).length, 24);
assert.ok(catalog.includes('/tv.css?v=1'));
assert.ok(!catalog.includes('type="module"'));
const detail = await (await fetch(base + '/tv/anime/35062')).text();
assert.ok(detail.includes('data-anime="35062"'));
assert.ok(detail.includes('Плеер AnimeShadow'));
assert.equal((await fetch(base + '/tv/anime/999999999')).status, 404);
const invalid = await fetch(base + '/tv?page=-1');
assert.equal(invalid.status, 422);
assert.match(invalid.headers.get('content-type'), /text\/html/);
assert.ok((await invalid.text()).includes('/tv.css?v=1'));
const invalidSource = await fetch(base + '/api/tv/sources/0');
assert.equal(invalidSource.status, 422);
assert.match(invalidSource.headers.get('content-type'), /application\/json/);
for (const asset of ['/tv.css?v=1', '/tv.js?v=1', '/tv-hls.js']) {
  const res = await fetch(base + asset);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).length > 100);
}
const streams = await fetch(base + '/api/tv/sources/35062', { signal: AbortSignal.timeout(45000) });
assert.equal(streams.status, 200);
const data = await streams.json();
assert.ok(data.sources.every(s => s.format === 'hls' || s.format === 'mp4'));
console.log(JSON.stringify({ status: 'PASS', checks: 'TV routing, opt-out, escaped HTML, styled catalogue/detail, local HLS engine, direct sources', sources: data.sources.length, pending: data.sourcesPending || false }));
