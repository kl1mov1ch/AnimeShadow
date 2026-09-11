import {
  ANIME_WITH_GENRES_INCLUDE,
  type LibraryStatus,
  type Prisma,
  type PrismaClient,
  toSummaryDto,
} from "@animeshadow/db";
import type {
  LibraryEntry,
  LibrarySummary,
  UpsertLibraryInput,
} from "@animeshadow/shared";
import { NotFoundError } from "../lib/errors.js";
import type { CatalogService } from "./catalog.service.js";

export interface LibraryServiceDeps {
  prisma: PrismaClient;
  catalog: CatalogService;
}

const ENTRY_INCLUDE = {
  anime: { include: ANIME_WITH_GENRES_INCLUDE },
} satisfies Prisma.LibraryEntryInclude;

type EntryRow = Prisma.LibraryEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export class LibraryService {
  private readonly prisma: PrismaClient;
  private readonly catalog: CatalogService;

  constructor(deps: LibraryServiceDeps) {
    this.prisma = deps.prisma;
    this.catalog = deps.catalog;
  }

  async list(userId: string, status?: LibraryStatus): Promise<LibraryEntry[]> {
    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: "desc" },
      include: ENTRY_INCLUDE,
    });
    return rows.map(toLibraryEntry);
  }

  async summary(userId: string): Promise<LibrarySummary> {
    const grouped = await this.prisma.libraryEntry.groupBy({
      by: ["status"],
      where: { userId },
      _count: { _all: true },
    });

    const byStatus = {} as LibrarySummary["byStatus"];
    let total = 0;
    for (const group of grouped) {
      byStatus[group.status] = group._count._all;
      total += group._count._all;
    }
    return { total, byStatus };
  }

  async upsert(
    userId: string,
    animeId: number,
    input: UpsertLibraryInput,
  ): Promise<LibraryEntry> {
    // Guarantee the anime exists in the local catalogue so the FK holds and the
    // entry can render without a follow-up fetch. (English — no need to translate.)
    await this.catalog.getAnimeById(animeId, "en");

    const data = {
      status: input.status,
      score: input.score ?? null,
      ...(input.progress != null ? { progress: input.progress } : {}),
      notes: input.notes ?? null,
    };

    const row = await this.prisma.libraryEntry.upsert({
      where: { userId_animeId: { userId, animeId } },
      create: { userId, animeId, ...data, progress: input.progress ?? 0 },
      update: data,
      include: ENTRY_INCLUDE,
    });
    return toLibraryEntry(row);
  }

  async remove(userId: string, animeId: number): Promise<void> {
    const { count } = await this.prisma.libraryEntry.deleteMany({
      where: { userId, animeId },
    });
    if (count === 0) {
      throw new NotFoundError("That title isn't in your library.");
    }
  }
}

function toLibraryEntry(row: EntryRow): LibraryEntry {
  return {
    anime: toSummaryDto(row.anime),
    status: row.status,
    score: row.score,
    progress: row.progress,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
