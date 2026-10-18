/** Old TV browsers cannot parse the main ES2022 / Tailwind 4 application. */
export function isTvBrowser(userAgent: string): boolean {
  return /SmartTV|Smart-TV|SMART TV|Tizen|Web0S|WebOS|HbbTV|NetCast|Viera/i.test(userAgent);
}

export function tvDestination(path: string): string {
  const id = /^\/anime\/(\d+)(?:[-/?#]|$)/.exec(path)?.[1];
  return id ? `/tv/anime/${id}` : "/tv";
}

export function escapeTv(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function tvDocument(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="theme-color" content="#0a0b10"><title>${escapeTv(title)} — AnimeShadow TV</title><link rel="stylesheet" href="/tv.css?v=1"><script src="/tv.js?v=1" defer></script></head><body><header><a class="brand" href="/tv"><b>影</b> AnimeShadow <small>TV</small></a><a href="/tv">Каталог</a><a href="/?tv=0">Обычная версия</a></header><main>${body}</main><footer>Стрелки — выбор · OK — открыть · Назад — вернуться<br>AnimeShadow · Удобный просмотр на большом экране</footer></body></html>`;
}
