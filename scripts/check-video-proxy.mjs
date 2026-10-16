import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:4000/api/anime/20/streams/animevost/7/1/video.mp4';
for (const range of ['bytes=0-1023', 'bytes=1000000-1001023']) {
  const r = await fetch(base, { headers: { Range: range, Origin: 'http://localhost:5173' }, signal: AbortSignal.timeout(15000) });
  const bytes = await r.arrayBuffer();
  assert.equal(r.status, 206);
  assert.equal(bytes.byteLength, 1024);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  console.log(JSON.stringify({ range, status: r.status, length: bytes.byteLength, actualRange: r.headers.get('content-range'), cors: true }));
}
const invalid = await fetch(base, { headers: { Range: 'bytes=8-2' }, signal: AbortSignal.timeout(10000) });
assert.equal(invalid.status, 416);
console.log(JSON.stringify({ invalidRange: invalid.status }));
