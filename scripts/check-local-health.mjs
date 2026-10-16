await Promise.all(['http://127.0.0.1:4000/api/health', 'http://localhost:5173/api/health'].map(async url => {
  try { const start = Date.now(); const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); console.log(JSON.stringify({ url, status: r.status, ms: Date.now()-start, body: (await r.text()).slice(0,300) })); }
  catch(e) { console.log(JSON.stringify({ url, error: e.message })); }
}));
