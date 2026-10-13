/**
 * The Content-Security-Policy every page goes out with.
 *
 * What it is for: the login token lives in the browser next to whatever
 * scripts the page runs, so the one rule that matters is where scripts may
 * come from — this site, and the analytics it loads (Yandex Metrica, Google
 * Analytics, Umami when configured). No inline script, no `eval`, no
 * plugins, and no other site may frame these pages.
 *
 * Deliberately loose where being strict would break the site for little
 * gain: pictures, video and connections go to many hosts (the image proxy's
 * sources, AniLibria's changing CDN hosts, the analytics endpoints), and the
 * players are other sites' frames.
 */
const SCRIPT_HOSTS = [
  "https://mc.yandex.ru",
  "https://mc.yandex.com",
  "https://yastatic.net",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
];

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export const PAGE_CSP = [
  "default-src 'self'",
  `script-src 'self' ${[...SCRIPT_HOSTS, originOf(process.env.VITE_UMAMI_SRC)].filter(Boolean).join(" ")}`,
  // Inline style attributes are how React sets dynamic styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  // data: — the QR code library reads its centre badge (an inline SVG)
  // through a request; without it the code is drawn blank.
  "connect-src 'self' https: wss: data:",
  // Kodik, Alloha, YouTube trailers, Metrica's session replay.
  "frame-src https:",
  // hls.js runs its demuxer in a worker made from a blob.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");
