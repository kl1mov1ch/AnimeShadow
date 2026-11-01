/** Only HTTPS provider pages, with no credentials or local-network destination. */
export function safeExternalUrl(input: string): string | null {
  try {
    const url = new URL(input.startsWith("//") ? `https:${input}` : input);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return null;
    if (
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.includes(":") ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
