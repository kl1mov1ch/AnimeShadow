import type { Prisma, PrismaClient } from "@animeshadow/db";
import type {
  Comment,
  CommentAuthor,
  CommentQuery,
  CreateCommentInput,
} from "@animeshadow/shared";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import type { AchievementService } from "./achievement.service.js";

export interface CommentServiceDeps {
  prisma: PrismaClient;
  proForAll?: boolean;
  achievements?: AchievementService;
}

const COMMENT_INCLUDE = {
  user: {
    select: {
      id: true,
      displayName: true,
      username: true,
      avatarUrl: true,
      proSince: true,
      showcaseAchievementIds: true,
      titlePrefix: true,
      titleIcon: true,
    },
  },
} satisfies Prisma.CommentInclude;

type Row = Prisma.CommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export class CommentService {
  private readonly prisma: PrismaClient;
  private readonly proForAll: boolean;
  private readonly achievements?: AchievementService;

  constructor(deps: CommentServiceDeps) {
    this.prisma = deps.prisma;
    this.proForAll = deps.proForAll ?? false;
    this.achievements = deps.achievements;
  }

  async list(
    animeId: number,
    query: CommentQuery,
    viewerId?: string,
  ): Promise<{ comments: Comment[]; count: number }> {
    const where: Prisma.CommentWhereInput = { animeId };
    if (query.onlyAnon) where.mode = "ANON";
    if (query.onlyDonor) where.user = { proSince: { not: null } };

    const rows = await this.prisma.comment.findMany({
      where,
      include: COMMENT_INCLUDE,
      orderBy:
        query.sort === "old"
          ? { createdAt: "asc" }
          : query.sort === "top"
            ? [{ likeCount: "desc" }, { createdAt: "desc" }]
            : { createdAt: "desc" },
      take: 400,
    });

    const myVotes = viewerId
      ? new Map(
          (
            await this.prisma.commentVote.findMany({
              where: { userId: viewerId, commentId: { in: rows.map((r) => r.id) } },
              select: { commentId: true, value: true },
            })
          ).map((v) => [v.commentId, v.value]),
        )
      : new Map<string, number>();

    const dtos = rows.map((row) => this.toDto(row, myVotes.get(row.id) ?? 0));
    const byId = new Map(dtos.map((c) => [c.id, c]));
    const roots: Comment[] = [];
    for (const c of dtos) {
      if (c.parentId && byId.has(c.parentId)) {
        byId.get(c.parentId)!.replies.push(c);
      } else {
        roots.push(c);
      }
    }
    // replies always chronological
    for (const c of dtos) {
      c.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    return { comments: roots, count: rows.length };
  }

  async create(userId: string, input: CreateCommentInput): Promise<Comment> {
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true },
    });
    if (author?.isBanned) throw new UnauthorizedError("This account has been suspended.");

    let anonSeq: number | null = null;
    if (input.mode === "ANON") {
      const existing = await this.prisma.comment.findFirst({
        where: { userId, animeId: input.animeId, anonSeq: { not: null } },
        select: { anonSeq: true },
      });
      if (existing?.anonSeq != null) {
        anonSeq = existing.anonSeq;
      } else {
        const top = await this.prisma.comment.aggregate({
          where: { animeId: input.animeId },
          _max: { anonSeq: true },
        });
        anonSeq = (top._max.anonSeq ?? 1000) + 1;
      }
    }

    const row = await this.prisma.comment.create({
      data: {
        animeId: input.animeId,
        userId,
        parentId: input.parentId ?? null,
        body: input.body,
        mode: input.mode,
        anonSeq,
      },
      include: COMMENT_INCLUDE,
    });
    void this.achievements?.recompute(userId).catch(() => undefined);
    return this.toDto(row, 0);
  }

  async edit(userId: string, id: string, body: string): Promise<Comment> {
    const owned = await this.prisma.comment.findUnique({ where: { id } });
    if (!owned) throw new NotFoundError("Комментарий не найден.");
    if (owned.userId !== userId) throw new ForbiddenError();
    const row = await this.prisma.comment.update({
      where: { id },
      data: { body, editedAt: new Date() },
      include: COMMENT_INCLUDE,
    });
    return this.toDto(row, 0);
  }

  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.prisma.comment.findUnique({ where: { id } });
    if (!owned) throw new NotFoundError("Комментарий не найден.");
    if (owned.userId !== userId) throw new ForbiddenError();
    await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), body: "" },
    });
  }

  /** Same soft-delete as `remove()`, but for /admin/comments — moderating
   * someone else's comment, so it deliberately skips the ownership check. */
  async adminRemove(id: string): Promise<void> {
    const owned = await this.prisma.comment.findUnique({ where: { id } });
    if (!owned) throw new NotFoundError("Комментарий не найден.");
    await this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), body: "" },
    });
  }

  async vote(userId: string, id: string, value: -1 | 0 | 1): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundError("Комментарий не найден.");

    await this.prisma.$transaction(async (tx) => {
      if (value === 0) {
        await tx.commentVote.deleteMany({ where: { commentId: id, userId } });
      } else {
        await tx.commentVote.upsert({
          where: { commentId_userId: { commentId: id, userId } },
          create: { commentId: id, userId, value },
          update: { value },
        });
      }
      const [likes, dislikes] = await Promise.all([
        tx.commentVote.count({ where: { commentId: id, value: 1 } }),
        tx.commentVote.count({ where: { commentId: id, value: -1 } }),
      ]);
      await tx.comment.update({
        where: { id },
        data: { likeCount: likes, dislikeCount: dislikes },
      });
    });

    const row = await this.prisma.comment.findUniqueOrThrow({
      where: { id },
      include: COMMENT_INCLUDE,
    });
    return this.toDto(row, value);
  }

  private toDto(row: Row, myVote: number): Comment {
    const deleted = row.deletedAt != null;
    const anon = row.mode === "ANON";
    const author: CommentAuthor = deleted
      ? {
          kind: "deleted",
          id: null,
          displayName: "[удалено]",
          username: null,
          avatarUrl: null,
          rank: null,
          isPro: false,
          showcaseAchievementIds: [],
          titlePrefix: null,
          titleIcon: null,
        }
      : anon
        ? {
            kind: "anon",
            id: null,
            displayName: `Аниме-ниндзя #${row.anonSeq ?? 0}`,
            username: null,
            avatarUrl: null,
            rank: null,
            isPro: false,
            showcaseAchievementIds: [],
            titlePrefix: null,
            titleIcon: null,
          }
        : {
            kind: "user",
            id: row.userId,
            displayName: row.user.displayName,
            username: row.user.username,
            avatarUrl: row.user.avatarUrl,
            rank: null,
            isPro: this.proForAll || row.user.proSince != null,
            showcaseAchievementIds: row.user.showcaseAchievementIds,
            // Saving these already requires real PRO (not proForAll), so no
            // extra gate is needed here beyond passing the stored value through.
            titlePrefix: row.user.titlePrefix,
            titleIcon: row.user.titleIcon as CommentAuthor["titleIcon"],
          };

    return {
      id: row.id,
      animeId: row.animeId,
      parentId: row.parentId,
      body: row.body,
      mode: row.mode as Comment["mode"],
      author,
      likeCount: row.likeCount,
      dislikeCount: row.dislikeCount,
      myVote: (myVote === 1 ? 1 : myVote === -1 ? -1 : 0) as Comment["myVote"],
      editedAt: row.editedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      replies: [],
    };
  }
}
