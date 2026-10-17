for (const id of [5114, 20, 16498, 57555]) {
  const start = Date.now();
  try {
    const response = await fetch(`http://127.0.0.1:4000/api/anime/${id}/episodes-info?lang=ru`, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    console.log(JSON.stringify({ id, status: response.status, ms: Date.now() - start, pending: data.pending, episodes: data.episodes?.length,
      namedRu: data.episodes?.filter((e) => /[а-яё]/i.test(e.title ?? "")).length,
      frames: data.episodes?.filter((e) => e.thumb).length,
      first: data.episodes?.slice(0, 3).map(({ number, title, thumb }) => ({ number, title, imageHost: thumb ? new URL(thumb).hostname : null })) }));
  } catch (error) { console.log(JSON.stringify({ id, error: error.message })); }
}
