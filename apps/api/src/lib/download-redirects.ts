import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { safeExternalUrl } from "./external-player.js";
import { TtlCache } from "./cache.js";

// Observed Kodik handoffs: p14 -> p13 and cloud2 -> gadolinium.cloud2.
const CDN_FAMILIES = ["solodcdn.com"];
const addresses = new TtlCache<string[]>(60_000, 64);
const resolvePublicHost = (host: string) =>
  addresses.wrap(host, async () =>
    (await lookup(host, { all: true })).map((r) => r.address),
  );

const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(ip, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
export function publicDownloadAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}

/** A verified source may redirect within its own CDN, never to a different domain or LAN. */
export async function fetchDownloadAsset(
  input: string,
  init: RequestInit,
  roots: Set<string>,
  resolve = resolvePublicHost,
) {
  let url = new URL(input);
  for (let hop = 0; hop <= 4; hop++) {
    const response = await fetch(url, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, url: url.href };
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || hop === 4)
      throw new Error("Invalid or excessive download redirects");
    const next = new URL(location, url);
    const sameCdn = CDN_FAMILIES.some((domain) =>
      [url.hostname, next.hostname].every(
        (host) => host === domain || host.endsWith("." + domain),
      ),
    );
    if (
      !safeExternalUrl(next.href) ||
      (next.origin !== url.origin &&
        !roots.has(next.origin) &&
        !sameCdn &&
        !next.hostname.endsWith("." + url.hostname))
    )
      throw new Error(
        `Download redirect left the verified CDN: ${url.hostname} -> ${next.hostname}`,
      );
    if (next.hostname !== url.hostname) {
      const addresses = await resolve(next.hostname);
      if (!addresses.length || addresses.some((ip) => !publicDownloadAddress(ip)))
        throw new Error("Private download redirect");
    }
    roots.add(next.origin);
    url = next;
  }
  throw new Error("Download redirect limit");
}
