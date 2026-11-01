// Resumable additive import: existing detail, art and user collections stay intact.
import { readFile, writeFile, rename } from "node:fs/promises";
import { ShikimoriClient, toAnimeSummary } from "@animeshadow/shikimori";
import { prisma, toAnimeListRow } from "../dist/index.js";

const targetArg = process.argv
  .find((arg) => arg.startsWith("--target="))
  ?.slice("--target=".length);
const target = Number(targetArg ?? process.env.BULK_SEED_TARGET ?? 15000);
if (!Number.isSafeInteger(target) || target < 1 || target > 100000)
  throw new Error("BULK_SEED_TARGET must be 1–100000");
const checkpoint = new URL("../.catalog-import.json", import.meta.url);
const temporary = new URL("../.catalog-import.json.tmp", import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shiki = new ShikimoriClient({
  baseUrl: process.env.SHIKIMORI_BASE_URL ?? "https://shikimori.io",
  userAgent: process.env.SHIKIMORI_USER_AGENT ?? "AnimeShadow/1.0 (catalogue import)",
  minIntervalMs: 800,
});

async function loadCheckpoint() {
  try {
    const saved = JSON.parse(await readFile(checkpoint, "utf8"));
    if (
      saved.version !== 1 ||
      ![saved.shikimori, saved.jikan].every(
        (page) => Number.isInteger(page) && page >= 1,
      )
    )
      throw new Error("Invalid catalogue checkpoint");
    return saved;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, shikimori: 1, jikan: 1 };
    throw error;
  }
}

async function jikanPage(page) {
  const url = new URL("https://api.jikan.moe/v4/anime");
  url.search = new URLSearchParams({
    page: String(page),
    limit: "25",
    order_by: "mal_id",
    sort: "asc",
    sfw: "true",
  }).toString();
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(1100);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        void response.body?.cancel();
        if (response.status === 429 && attempt < 3) {
          await sleep(Math.min(60_000, Math.max(5_000, (retryAfter || 10) * 1000)));
          continue;
        }
        throw new Error(`Jikan HTTP ${response.status}`);
      }
      const body = await response.json();
      if (!Array.isArray(body.data)) throw new Error("Jikan returned an invalid page");
      return {
        more: body.pagination?.has_next_page === true,
        items: body.data
          .filter(
            (item) =>
              Number.isInteger(item.mal_id) &&
              item.mal_id > 0 &&
              !/^rx/i.test(item.rating ?? ""),
          )
          .map((item) => ({
            ...toAnimeSummary({
              id: item.mal_id,
              name: item.title,
              russian: null,
              english: item.title_english ? [item.title_english] : [],
              japanese: item.title_japanese ? [item.title_japanese] : [],
              image: {
                original:
                  item.images?.webp?.large_image_url ??
                  item.images?.jpg?.large_image_url,
                preview: item.images?.webp?.image_url ?? item.images?.jpg?.image_url,
              },
              kind: item.type?.toLowerCase(),
              status: item.airing
                ? "ongoing"
                : item.status === "Not yet aired"
                  ? "anons"
                  : "released",
              episodes: item.episodes,
              score: String(item.score ?? ""),
              aired_on: item.aired?.from,
              description: item.synopsis,
              genres: [],
              rates_statuses_stats: [{ value: item.members ?? 0 }],
            }),
            rating: item.rating ?? null,
          })),
      };
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error("Jikan retry budget exhausted");
}

async function run() {
  const state = await loadCheckpoint();
  const before = await prisma.anime.count();
  let total = before;
  console.log(`Catalogue: ${total} unique titles; target: ${target}`);
  for (const provider of ["shikimori", "jikan"]) {
    while (total < target) {
      const page = state[provider];
      let result;
      try {
        result =
          provider === "shikimori"
            ? await shiki
                .listAnimes({ order: "id", limit: 50, page, censored: true })
                .then((items) => ({
                  items: items.map(toAnimeSummary),
                  more: items.length === 50,
                }))
            : await jikanPage(page);
      } catch (error) {
        console.warn(`${provider} page ${page}: ${error.message}. Checkpoint kept.`);
        break;
      }
      const unique = [...new Map(result.items.map((item) => [item.id, item])).values()];
      const existing = new Set(
        (
          await prisma.anime.findMany({
            where: { id: { in: unique.map((item) => item.id) } },
            select: { id: true },
          })
        ).map((row) => row.id),
      );
      const missing = unique.filter((item) => !existing.has(item.id));
      const batch = missing.slice(0, target - total);
      if (batch.length)
        await prisma.anime.createMany({
          data: batch.map((item) => ({
            ...toAnimeListRow(item),
            rating: item.rating ?? null,
          })),
          skipDuplicates: true,
        });
      total = await prisma.anime.count();
      state[provider] = batch.length < missing.length || !result.more ? page : page + 1;
      await writeFile(temporary, JSON.stringify(state, null, 2) + "\n");
      await rename(temporary, checkpoint);
      console.log(`${provider} page ${page}: +${batch.length}; ${total}/${target}`);
      if (!result.more) break;
    }
  }
  console.log(
    `Finished: ${total} unique titles (${total - before} added). Target ${target}: ${total >= target ? "reached" : "not reached"}.`,
  );
  if (total < target) process.exitCode = 2;
}

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
