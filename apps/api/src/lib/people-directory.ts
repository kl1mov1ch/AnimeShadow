import type { PrismaClient } from "@animeshadow/db";
import type { PeopleDirectoryResponse } from "@animeshadow/shared";
import { publicUserCards } from "./public-user-cards.js";

export const PEOPLE_DIRECTORY_PAGE_SIZE = 20;

/** Stable paging and literal substring search; legacy people search is unchanged. */
export async function peopleDirectory(
  prisma: PrismaClient,
  rawQuery: string,
  page: number,
  viewerId: string | null = null,
): Promise<PeopleDirectoryResponse> {
  const typed = rawQuery.trim();
  const q = typed.replace(/^@+/, "").trim().slice(0, 60);
  // Do not scan names or build expensive cards for a half-typed query.
  if (typed !== "" && q.length < 2) return { items: [], page, hasMore: false };
  const escaped = q.replace(/[\\%_]/g, (character) => `\\${character}`);
  const pattern = `%${escaped}%`;
  const prefix = `${escaped}%`;
  const hits = q === "" ? await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE "isBanned" = false
      AND COALESCE("profilePrivacy"->>'profile', 'public') = 'public'
    ORDER BY "lastSeenAt" DESC NULLS LAST, "createdAt" DESC, id ASC
    LIMIT ${PEOPLE_DIRECTORY_PAGE_SIZE + 1} OFFSET ${(page - 1) * PEOPLE_DIRECTORY_PAGE_SIZE}
  ` : await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE "isBanned" = false
      AND COALESCE("profilePrivacy"->>'profile', 'public') = 'public'
      AND ("username" ILIKE ${pattern} OR "displayName" ILIKE ${pattern})
    ORDER BY ("username" ILIKE ${prefix} OR "displayName" ILIKE ${prefix}) DESC,
      "lastSeenAt" DESC NULLS LAST, "createdAt" DESC, id ASC
    LIMIT ${PEOPLE_DIRECTORY_PAGE_SIZE + 1} OFFSET ${(page - 1) * PEOPLE_DIRECTORY_PAGE_SIZE}
  `;
  if (hits.length === 0) return { items: [], page, hasMore: false };
  const pageIds = hits.slice(0, PEOPLE_DIRECTORY_PAGE_SIZE).map((row) => row.id);
  const cards = await publicUserCards(prisma, pageIds, viewerId);
  return {
    page,
    hasMore: hits.length > PEOPLE_DIRECTORY_PAGE_SIZE,
    items: pageIds.flatMap((id) => { const card = cards.get(id); return card ? [card] : []; }),
  };
}
