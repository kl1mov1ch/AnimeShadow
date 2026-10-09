/**
 * A small user-agent reader: device class, browser and OS family — enough
 * for the admin's breakdowns, no library and no version fingerprinting.
 */
export interface AgentInfo {
  device: "mobile" | "tablet" | "desktop" | "bot";
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | undefined): AgentInfo {
  const s = ua ?? "";
  if (!s || /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|axios|node-fetch/i.test(s)) {
    return { device: "bot", browser: "Бот", os: "—" };
  }

  const os = /Windows/i.test(s)
    ? "Windows"
    : /Android/i.test(s)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(s)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(s)
          ? /Mobile/i.test(s) ? "iOS" : "macOS"
          : /CrOS/i.test(s)
            ? "ChromeOS"
            : /Linux/i.test(s)
              ? "Linux"
              : "Другая";

  const browser = /YaBrowser/i.test(s)
    ? "Яндекс Браузер"
    : /Edg(e|A|iOS)?\//i.test(s)
      ? "Edge"
      : /OPR\/|Opera/i.test(s)
        ? "Opera"
        : /SamsungBrowser/i.test(s)
          ? "Samsung Internet"
          : /Firefox|FxiOS/i.test(s)
            ? "Firefox"
            : /Chrome|CriOS/i.test(s)
              ? "Chrome"
              : /Safari/i.test(s)
                ? "Safari"
                : "Другой";

  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s);
  return { device: tablet ? "tablet" : mobile ? "mobile" : "desktop", browser, os };
}
