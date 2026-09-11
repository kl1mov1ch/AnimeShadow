// One-off: refill imageUrl/imageLargeUrl for anime rows that lost their poster
// during the shikimori.one -> shikimori.io migration. Pass 1 re-pulls from the
// primary source in `ids` batches (~6 calls); pass 2 falls back to MAL/Jikan for
// whatever still has no artwork (announced / newly airing titles).
import { JikanClient } from "../../jikan/dist/index.js";
import { ShikimoriClient, toAnimeSummary } from "@animeshadow/shikimori";
import { prisma } from "../dist/index.js";

const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (image heal)",
});
const jikan = new JikanClient();

const rows = await prisma.anime.findMany({
  where: { OR: [{ imageUrl: null }, { imageUrl: { contains: "shikimori.one" } }] },
  select: { id: true },
});
console.log(`pass 1 (primary): ${rows.length} rows`);

const ids = rows.map((r) => r.id);
let fixed = 0;
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50);
  const list = await shiki.listAnimes({ ids: batch.join(","), limit: 50 });
  for (const short of list) {
    const s = toAnimeSummary(short);
    if (!s.imageUrl && !s.imageLargeUrl) continue;
    await prisma.anime.update({
      where: { id: s.id },
      data: { imageUrl: s.imageUrl, imageLargeUrl: s.imageLargeUrl },
    });
    fixed++;
  }
}
console.log(`  restored ${fixed}`);

const stillNull = await prisma.anime.findMany({
  where: { imageUrl: null },
  select: { id: true },
});
console.log(`pass 2 (MAL fallback): ${stillNull.length} rows`);

let mal = 0;
for (const { id } of stillNull) {
  try {
    const poster = await jikan.getAnimePoster(id);
    const large = poster?.large ?? poster?.small ?? null;
    const small = poster?.small ?? poster?.large ?? null;
    if (!large && !small) continue;
    await prisma.anime.update({
      where: { id },
      data: { imageUrl: small, imageLargeUrl: large },
    });
    mal++;
  } catch (error) {
    console.warn(`  ${id}: ${(error).message}`);
  }
}
console.log(`  restored ${mal}`);

// Pass 3: AniList (by MAL id, then by title) — near-total medium coverage.
const stillNull3 = await prisma.anime.findMany({
  where: { imageUrl: null },
  select: { id: true, title: true },
});
console.log(`pass 3 (AniList): ${stillNull3.length} rows`);

async function anilist(malId, title) {
  const ask = async (query, variables) => {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const img = j?.data?.Media?.coverImage;
      const url = img?.extraLarge ?? img?.large ?? null;
      return url && !url.includes("default.jpg") ? url : null;
    } catch {
      return null;
    }
  };
  return (
    (await ask(
      "query($idMal:Int){Media(idMal:$idMal,type:ANIME){coverImage{extraLarge large}}}",
      { idMal: malId },
    )) ??
    (title
      ? await ask(
          "query($s:String){Media(search:$s,type:ANIME,sort:SEARCH_MATCH){coverImage{extraLarge large}}}",
          { s: title },
        )
      : null)
  );
}

let al = 0;
for (const { id, title } of stillNull3) {
  const url = await anilist(id, title);
  if (!url) continue;
  await prisma.anime.update({
    where: { id },
    data: { imageUrl: url, imageLargeUrl: url },
  });
  al++;
  await new Promise((r) => setTimeout(r, 700)); // AniList ~90/min
}
console.log(`  restored ${al}`);

// Pass 4: Kitsu (by title).
const stillNull4 = await prisma.anime.findMany({
  where: { imageUrl: null },
  select: { id: true, title: true },
});
console.log(`pass 4 (Kitsu): ${stillNull4.length} rows`);

async function kitsuPoster(title) {
  if (!title || title.trim().length < 2) return null;
  try {
    const url = new URL("https://kitsu.io/api/edge/anime");
    url.searchParams.set("filter[text]", title.trim());
    url.searchParams.set("page[limit]", "1");
    url.searchParams.set("fields[anime]", "posterImage");
    const res = await fetch(url, { headers: { accept: "application/vnd.api+json" } });
    if (!res.ok) return null;
    const json = await res.json();
    const p = json.data?.[0]?.attributes?.posterImage;
    return p?.original ?? p?.large ?? p?.medium ?? null;
  } catch {
    return null;
  }
}

let ki = 0;
for (const { id, title } of stillNull4) {
  const url = await kitsuPoster(title);
  if (!url) continue;
  await prisma.anime.update({ where: { id }, data: { imageUrl: url, imageLargeUrl: url } });
  ki++;
}
console.log(`  restored ${ki}`);

// Pass 5: AniLibria (by title) — RU-relevant titles the others miss.
const stillNull5 = await prisma.anime.findMany({
  where: { imageUrl: null },
  select: { id: true, title: true },
});
console.log(`pass 5 (AniLibria): ${stillNull5.length} rows`);

async function anilibriaPoster(title) {
  if (!title || title.trim().length < 2) return null;
  try {
    const url = new URL("https://api.anilibria.top/api/v1/app/search/releases");
    url.searchParams.set("query", title.trim());
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json();
    const poster = Array.isArray(json) ? json[0]?.poster : undefined;
    const src = poster?.optimized?.src ?? poster?.src;
    if (!src) return null;
    return src.startsWith("http") ? src : `https://anilibria.top${src}`;
  } catch {
    return null;
  }
}

let lib = 0;
for (const { id, title } of stillNull5) {
  const url = await anilibriaPoster(title);
  if (!url) continue;
  await prisma.anime.update({ where: { id }, data: { imageUrl: url, imageLargeUrl: url } });
  lib++;
}
console.log(`  restored ${lib}`);

const remaining = await prisma.anime.count({ where: { imageUrl: null } });
console.log(
  `done: ${fixed + mal + al + ki + lib} posters restored, ${remaining} truly have none anywhere`,
);
await prisma.$disconnect();
