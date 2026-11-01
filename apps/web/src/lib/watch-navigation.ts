/** Only actual route links are changed: seek anchors, forms and modifiers keep their meaning. */
export function watchNavigationDestination(
  href: string,
  current: string,
  target: string | null,
  download: boolean,
): URL | null {
  if (download || (target && target !== "_self")) return null;
  try {
    const url = new URL(href, current),
      from = new URL(current);
    if (url.origin !== from.origin || !["https:", "http:"].includes(url.protocol))
      return null;
    if (url.pathname === from.pathname && url.search === from.search) return null;
    return url;
  } catch {
    return null;
  }
}
