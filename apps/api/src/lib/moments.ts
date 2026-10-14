import type { PrismaClient } from "@animeshadow/db";
import { type CreateMomentInput, type FavoriteMoment, MAX_MOMENTS } from "@animeshadow/shared";
import { BadRequestError, NotFoundError } from "./errors.js";
import { canSeePart } from "./privacy.js";

/** An account's favourite moments, in its order — if this viewer may see the favourites. */
export async function listMoments(prisma: PrismaClient, userId: string, viewerId: string | null): Promise<FavoriteMoment[]> {
  if (!(await canSeePart(prisma, userId, viewerId, "favorites"))) return [];
  const rows = await prisma.favoriteMoment.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], take: MAX_MOMENTS });
  if (rows.length === 0) return [];
  const anime = await prisma.anime.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.animeId))] } },
    select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true },
  });
  const byId = new Map(anime.map((a) => [a.id, a]));
  return rows
    .filter((r) => byId.has(r.animeId))
    .map((r) => ({
      id: r.id,
      anime: byId.get(r.animeId)!,
      episode: r.episode,
      seconds: r.seconds,
      dub: r.dub,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
}

/** Pins a moment; five at most — the sixth asks to let one go first. */
export async function addMoment(prisma: PrismaClient, userId: string, input: CreateMomentInput): Promise<FavoriteMoment[]> {
  const [count, anime] = await Promise.all([
    prisma.favoriteMoment.count({ where: { userId } }),
    prisma.anime.findUnique({ where: { id: input.animeId }, select: { id: true } }),
  ]);
  if (!anime) throw new NotFoundError("Тайтл не найден.");
  if (count >= MAX_MOMENTS) throw new BadRequestError(`Любимых моментов может быть ${MAX_MOMENTS} — уберите один в профиле.`);
  await prisma.favoriteMoment.create({
    data: { userId, ...input, dub: input.dub || null, note: input.note || null, position: count },
  });
  return listMoments(prisma, userId, userId);
}

export async function updateMoment(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: { note?: string | null; position?: number },
): Promise<FavoriteMoment[]> {
  const rows = await prisma.favoriteMoment.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const row = rows.find((r) => r.id === id);
  if (!row) throw new NotFoundError("Момент не найден.");
  if (input.note !== undefined) {
    await prisma.favoriteMoment.update({ where: { id }, data: { note: input.note || null } });
  }
  if (input.position !== undefined) {
    const order = rows.filter((r) => r.id !== id);
    order.splice(Math.min(input.position, order.length), 0, row);
    await prisma.$transaction(order.map((r, i) => prisma.favoriteMoment.update({ where: { id: r.id }, data: { position: i } })));
  }
  return listMoments(prisma, userId, userId);
}

export async function removeMoment(prisma: PrismaClient, userId: string, id: string): Promise<FavoriteMoment[]> {
  const { count } = await prisma.favoriteMoment.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError("Момент не найден.");
  return listMoments(prisma, userId, userId);
}
