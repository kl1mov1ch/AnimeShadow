import type { PrismaClient } from "@animeshadow/db";
import type { KodikResult } from "@animeshadow/kodik";
import { contentGuardWhere } from "../lib/content-guard.js";

/** Link an unindexed studio upload only to one exact catalogue alias and year. */
export async function resolveStudioIdentity(
  prisma: PrismaClient,
  row: KodikResult,
): Promise<number | null> {
  const aliases = [
    row.title,
    row.title_orig,
    row.other_title,
    row.material_data?.anime_title,
    row.material_data?.title_en,
  ].filter((value): value is string => Boolean(value?.trim()));
  const names = [
    ...new Set(
      aliases.flatMap((name) => [
        name.trim(),
        name.replace(/\s*\(?(?:19|20)\d{2}\)?\s*$/, "").trim(),
      ]),
    ),
  ].filter((name) => name.length >= 3);
  if (!names.length || !row.year) return null;
  const matches = await prisma.anime.findMany({
    where: {
      AND: [
        contentGuardWhere(false),
        {
          year: row.year,
          OR: names.flatMap((name) => [
            { title: { equals: name, mode: "insensitive" as const } },
            { titleLocalized: { equals: name, mode: "insensitive" as const } },
            { titleEnglish: { equals: name, mode: "insensitive" as const } },
          ]),
        },
      ],
    },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0]!.id : null;
}
