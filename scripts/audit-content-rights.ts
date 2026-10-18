import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

// Read-only local inventory. Availability is never evidence of a video licence.
// No provider requests, source URLs, credentials or account data are exported.
if (existsSync(resolve(".env"))) loadEnvFile(resolve(".env"));
const { prisma } = await import("../packages/db/src/index.js");
const output = resolve("docs/rights-audit");
const rows: unknown[][] = [];
const studios: unknown[][] = [];
const providerCounts = new Map<string, number>();
let playable = 0;
let direct = 0;
let lastId: number | undefined;
const columns = [
  "mal_id",
  "title",
  "title_original",
  "year",
  "page",
  "cached_player_available",
  "cached_custom_player",
  "providers",
  "cached_sources",
  "honkon",
  "site_video_rights",
  "rightsholder",
  "territories",
  "licence_expires",
  "evidence_reference",
  "review_note",
];
const csv = (data: unknown[][]) =>
  "\uFEFF" +
  [columns, ...data]
    .map((row) =>
      row
        .map((value) => {
          let cell = String(value ?? "");
          // Prevent spreadsheet formulas in imported titles.
          if (/^[=+@\-\t\r\n]/.test(cell)) cell = "'" + cell;
          return `"${cell.replaceAll('"', '""')}"`;
        })
        .join(";"),
    )
    .join("\r\n") +
  "\r\n";

try {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '15s'`;
      for (;;) {
        const batch = await tx.anime.findMany({
          where: lastId == null ? {} : { id: { gt: lastId } },
          orderBy: { id: "asc" },
          take: 500,
          select: {
            id: true,
            slug: true,
            title: true,
            titleLocalized: true,
            year: true,
            watchAvailability: { select: { hasPlayer: true, hasCustomPlayer: true } },
            playerSources: { select: { provider: true, sourceKey: true, title: true } },
          },
        });
        if (!batch.length) break;
        for (const anime of batch) {
          const available = anime.watchAvailability?.hasPlayer ?? null;
          if (available) playable++;
          if (anime.watchAvailability?.hasCustomPlayer) direct++;
          const providers = [
            ...new Set(anime.playerSources.map((source) => source.provider)),
          ].sort();
          for (const provider of providers)
            providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
          const honkon = anime.playerSources.some(
            (source) =>
              /hon[\s-]*kon/i.test(source.title) ||
              (source.provider === "kodik" &&
                /^(?:kodik:)?4167$/.test(source.sourceKey)),
          );
          const row = [
            anime.id,
            anime.titleLocalized || anime.title,
            anime.title,
            anime.year,
            `/anime/${anime.slug || anime.id}`,
            available,
            anime.watchAvailability?.hasCustomPlayer ?? null,
            providers.join(", "),
            anime.playerSources.length,
            honkon,
            "UNCONFIRMED",
            "",
            "",
            "",
            "",
            "Владелец сообщил об отсутствии лицензий. Поиск правообладателей и проверка договоров не выполнены; наличие потока не является разрешением.",
          ];
          rows.push(row);
          if (honkon) studios.push(row);
        }
        lastId = batch.at(-1)!.id;
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60_000 },
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    scope:
      "Local database snapshot, all catalogue rows, no public or contractual rights verification",
    operatorCountry: "BY",
    audience: "CIS (territories require separate verification)",
    basis:
      "Owner states no video exhibition licences; schema contains no video-rights registry",
    titles: rows.length,
    cachedPlayerTitles: playable,
    cachedCustomPlayerTitles: direct,
    honkonTitles: studios.length,
    confirmedSiteVideoGrants: 0,
    status: "UNCONFIRMED",
    providerTitleCounts: Object.fromEntries(providerCounts),
    runtimeChanged: false,
  };
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "catalogue.csv"), csv(rows), "utf8");
  await writeFile(resolve(output, "honkon.csv"), csv(studios), "utf8");
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await prisma.$disconnect();
}
