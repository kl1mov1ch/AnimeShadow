import type { Prisma, PrismaClient } from "@animeshadow/db";
import { canSeePart } from "../lib/privacy.js";
import { proActive } from "../lib/pro.js";
import type {
  CreateProfileReportInput,
  FollowKind,
  FriendEvent,
  ProfileReportResult,
  SocialSummary,
  UserCard,
  WallPage,
  WallPost,
} from "@animeshadow/shared";
import { TtlCache } from "../lib/cache.js";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors.js";
import type { ProfileInsightsService } from "./profile-insights.service.js";

export interface SocialServiceDeps {
  prisma: PrismaClient;
  insights: ProfileInsightsService;
}

const CARD_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  proSince: true,
  trialUntil: true,
  proUntil: true,
  titleUnlocked: true,
  onlineStatus: true,
  avatarFrame: true,
  profileTitle: true,
  titlePrefix: true,
  titleIcon: true,
} satisfies Prisma.UserSelect;
type CardRow = Prisma.UserGetPayload<{ select: typeof CARD_SELECT }>;

const LIST_LIMIT = 60;
const WALL_PAGE = 20;
/** Whose activity the "friends" feed reads: the most recently seen of those followed. */
const FEED_PEOPLE = 16;

/**
 * People on the site: who follows whom (two follows both ways make two
 * friends), the wall on every profile where others leave a word, and what
 * the people one follows have been watching lately.
 */
export class SocialService {
  private readonly prisma: PrismaClient;
  private readonly insights: ProfileInsightsService;
  private readonly feedCache = new TtlCache<FriendEvent[]>(60_000, 500);

  constructor(deps: SocialServiceDeps) {
    this.prisma = deps.prisma;
    this.insights = deps.insights;
  }

  /** Whether the two follow each other. */
  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const n = await this.prisma.follow.count({
      where: { OR: [{ followerId: a, followingId: b }, { followerId: b, followingId: a }] },
    });
    return n === 2;
  }

  async summary(userId: string, viewerId: string | null): Promise<SocialSummary> {
    await this.ensureUser(userId);
    if (!(await canSeePart(this.prisma, userId, viewerId, "social"))) {
      // Hidden: no counts, no faces — but the viewer's own follow still shows.
      const [viewerFollows, followsViewer] = await Promise.all([
        viewerId ? this.prisma.follow.count({ where: { followerId: viewerId, followingId: userId } }) : Promise.resolve(0),
        viewerId ? this.prisma.follow.count({ where: { followerId: userId, followingId: viewerId } }) : Promise.resolve(0),
      ]);
      return { followers: 0, following: 0, friends: 0, isFollowing: viewerFollows > 0, followsYou: followsViewer > 0, friendFaces: [], hidden: true };
    }
    const [followers, following, friendIds, viewerFollows, followsViewer] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
      this.friendIds(userId),
      viewerId && viewerId !== userId
        ? this.prisma.follow.count({ where: { followerId: viewerId, followingId: userId } })
        : Promise.resolve(0),
      viewerId && viewerId !== userId
        ? this.prisma.follow.count({ where: { followerId: userId, followingId: viewerId } })
        : Promise.resolve(0),
    ]);
    return {
      followers,
      following,
      friends: friendIds.length,
      isFollowing: viewerFollows > 0,
      followsYou: followsViewer > 0,
      friendFaces: await this.cards(friendIds.slice(0, 6), viewerId),
      hidden: false,
    };
  }

  async follow(viewerId: string, targetId: string): Promise<SocialSummary> {
    if (viewerId === targetId) throw new BadRequestError("Нельзя подписаться на себя.");
    await this.ensureUser(targetId);
    await this.prisma.follow.createMany({ data: [{ followerId: viewerId, followingId: targetId }], skipDuplicates: true });
    this.feedCache.delete(viewerId);
    return this.summary(targetId, viewerId);
  }

  /**
   * A complaint about a profile, for the admins. One open complaint per
   * person per profile: sending again updates it instead of piling up.
   */
  async report(reporterId: string, targetId: string, input: CreateProfileReportInput): Promise<ProfileReportResult> {
    if (reporterId === targetId) throw new BadRequestError("Нельзя пожаловаться на свой профиль.");
    await this.ensureUser(targetId);
    const comment = input.comment?.trim() || null;
    const open = await this.prisma.profileReport.findFirst({
      where: { reporterId, targetId, status: "OPEN" },
      select: { id: true },
    });
    if (open) {
      await this.prisma.profileReport.update({ where: { id: open.id }, data: { reason: input.reason, comment } });
      return { already: true };
    }
    await this.prisma.profileReport.create({ data: { reporterId, targetId, reason: input.reason, comment } });
    return { already: false };
  }

  async unfollow(viewerId: string, targetId: string): Promise<SocialSummary> {
    await this.prisma.follow.deleteMany({ where: { followerId: viewerId, followingId: targetId } });
    this.feedCache.delete(viewerId);
    return this.summary(targetId, viewerId);
  }

  /** Followers, following or friends of an account, newest first. */
  async list(userId: string, kind: FollowKind, viewerId: string | null): Promise<UserCard[]> {
    await this.ensureUser(userId);
    if (!(await canSeePart(this.prisma, userId, viewerId, "social"))) return [];
    let ids: string[];
    if (kind === "friends") {
      ids = await this.friendIds(userId, LIST_LIMIT);
    } else if (kind === "followers") {
      const rows = await this.prisma.follow.findMany({
        where: { followingId: userId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: { followerId: true },
      });
      ids = rows.map((r) => r.followerId);
    } else {
      const rows = await this.prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: { followingId: true },
      });
      ids = rows.map((r) => r.followingId);
    }
    return this.cards(ids, viewerId);
  }

  /**
   * People worth following: recently on the site, with a nickname (so
   * their profile has an address), not the viewer, not already followed.
   */
  /** The ranking behind popularPeople, shared by every viewer for a few minutes. */
  private popularCache: { at: number; rows: Array<{ id: string; score: number; hours: number; followers: number }> } | null = null;

  /**
   * The most popular and active people of the last two weeks, for the
   * search window: hours watched, new followers and comments in that time,
   * weighed together. The ranking is the same for everyone and kept five
   * minutes; only how each person relates to the viewer is per viewer.
   */
  async popularPeople(
    viewerId: string | null,
  ): Promise<Array<UserCard & { weekHours: number; followers: number }>> {
    if (!this.popularCache || Date.now() - this.popularCache.at > 5 * 60_000) {
      const since = new Date(Date.now() - 14 * 86_400_000);
      const [watched, followed, commented, followerTotals] = await Promise.all([
        this.prisma.watchSession.groupBy({
          by: ["userId"],
          where: { startedAt: { gte: since } },
          _sum: { seconds: true },
          orderBy: { _sum: { seconds: "desc" } },
          take: 60,
        }),
        this.prisma.follow.groupBy({
          by: ["followingId"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { followingId: "desc" } },
          take: 60,
        }),
        this.prisma.comment.groupBy({
          by: ["userId"],
          where: { createdAt: { gte: since }, deletedAt: null },
          _count: { _all: true },
          orderBy: { _count: { userId: "desc" } },
          take: 60,
        }),
        this.prisma.follow.groupBy({ by: ["followingId"], _count: { _all: true } }),
      ]);
      const score = new Map<string, { score: number; hours: number }>();
      const add = (id: string, points: number, hours = 0) => {
        const cur = score.get(id) ?? { score: 0, hours: 0 };
        score.set(id, { score: cur.score + points, hours: cur.hours + hours });
      };
      for (const w of watched) {
        const hours = (w._sum.seconds ?? 0) / 3600;
        add(w.userId, hours, hours);
      }
      for (const f of followed) add(f.followingId, f._count._all * 3);
      for (const c of commented) add(c.userId, c._count._all * 0.5);
      const followers = new Map(followerTotals.map((f) => [f.followingId, f._count._all]));
      const rows = [...score.entries()]
        .map(([id, v]) => ({ id, score: v.score, hours: Math.round(v.hours * 10) / 10, followers: followers.get(id) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);
      this.popularCache = { at: Date.now(), rows };
    }
    const ranked = this.popularCache.rows.filter((r) => r.id !== viewerId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: ranked.map((r) => r.id) }, isBanned: false },
      select: CARD_SELECT,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const ordered = ranked.filter((r) => byId.has(r.id)).slice(0, 10);
    // Few active people yet (a young site): the recently seen fill in.
    const cards = await this.decorate(ordered.map((r) => byId.get(r.id)!), viewerId);
    const result = cards.map((c, i) => ({ ...c, weekHours: ordered[i]!.hours, followers: ordered[i]!.followers }));
    if (result.length >= 6) return result;
    const more = (await this.suggestions(viewerId)).filter((c) => !result.some((r) => r.id === c.id));
    return [...result, ...more.map((c) => ({ ...c, weekHours: 0, followers: 0 }))].slice(0, 10);
  }

  async suggestions(viewerId: string | null): Promise<UserCard[]> {
    const followed = viewerId
      ? (await this.prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } })).map((f) => f.followingId)
      : [];
    const rows = await this.prisma.user.findMany({
      where: {
        isBanned: false,
        username: { not: null },
        id: { notIn: [...followed, ...(viewerId ? [viewerId] : [])] },
      },
      orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }],
      take: 8,
      select: CARD_SELECT,
    });
    return this.decorate(rows, viewerId);
  }

  // ---- the wall ----

  async wall(ownerId: string, viewerId: string | null, cursor: string | null): Promise<WallPage> {
    await this.ensureUser(ownerId);
    if (!(await canSeePart(this.prisma, ownerId, viewerId, "wall"))) return { items: [], total: 0, nextCursor: null, hidden: true };
    const isAdmin = viewerId ? await this.isAdmin(viewerId) : false;
    const [rows, total] = await Promise.all([
      this.prisma.wallPost.findMany({
        where: { ownerId, deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: WALL_PAGE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { author: { select: CARD_SELECT } },
      }),
      this.prisma.wallPost.count({ where: { ownerId, deletedAt: null } }),
    ]);
    const page = rows.slice(0, WALL_PAGE);
    const authors = await this.decorate(
      page.map((r) => r.author),
      viewerId,
    );
    const byId = new Map(authors.map((a) => [a.id, a]));
    return {
      items: page.map((r) => this.toPost(r, byId.get(r.authorId)!, viewerId, ownerId, isAdmin)),
      total,
      nextCursor: rows.length > WALL_PAGE ? (page[page.length - 1]?.id ?? null) : null,
      hidden: false,
    };
  }

  async post(ownerId: string, authorId: string, body: string): Promise<WallPost> {
    const [owner, author] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, isBanned: true } }),
      this.prisma.user.findUnique({ where: { id: authorId }, select: { isBanned: true } }),
    ]);
    if (!owner || owner.isBanned) throw new NotFoundError("Профиль не найден.");
    if (author?.isBanned) throw new UnauthorizedError("This account has been suspended.");
    if (!(await canSeePart(this.prisma, ownerId, authorId, "wall"))) throw new ForbiddenError("Стена этого профиля закрыта.");
    const text = body.trim();
    if (!text) throw new BadRequestError("Пустое сообщение.");
    const row = await this.prisma.wallPost.create({
      data: { ownerId, authorId, body: text },
      include: { author: { select: CARD_SELECT } },
    });
    const [card] = await this.decorate([row.author], authorId);
    return this.toPost(row, card!, authorId, ownerId, false);
  }

  /** The author, the wall's owner or an admin may take a post down. */
  async remove(postId: string, viewerId: string): Promise<void> {
    const row = await this.prisma.wallPost.findUnique({ where: { id: postId }, select: { ownerId: true, authorId: true, deletedAt: true } });
    if (!row || row.deletedAt) throw new NotFoundError("Сообщение не найдено.");
    if (row.authorId !== viewerId && row.ownerId !== viewerId && !(await this.isAdmin(viewerId))) {
      throw new ForbiddenError("Это сообщение может удалить только автор или владелец профиля.");
    }
    await this.prisma.wallPost.update({ where: { id: postId }, data: { deletedAt: new Date() } });
  }

  // ---- friends' activity ----

  /**
   * What the people the viewer follows did lately, newest first: their
   * episodes, finished titles, scores, additions and achievements, each
   * person's privacy honoured. The most recently seen sixteen are read,
   * a few events each; kept a minute.
   */
  async friendsActivity(viewerId: string): Promise<FriendEvent[]> {
    return this.feedCache.wrap(viewerId, async () => {
      const follows = await this.prisma.follow.findMany({
        where: { followerId: viewerId },
        select: { following: { select: { ...CARD_SELECT, lastSeenAt: true } } },
        take: 200,
      });
      const people = follows
        .map((f) => f.following)
        .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))
        .slice(0, FEED_PEOPLE);
      if (people.length === 0) return [];
      const cards = new Map((await this.decorate(people, viewerId)).map((c) => [c.id, c]));
      const feeds = await Promise.all(
        people.map((p) =>
          this.insights
            .feed(p.id, viewerId)
            .then((events) => events.slice(0, 5).map((e) => ({ ...e, user: cards.get(p.id)! })))
            .catch(() => [] as FriendEvent[]),
        ),
      );
      return feeds
        .flat()
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 40);
    });
  }

  // ---- internals ----

  private async ensureUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundError("Профиль не найден.");
  }

  private async isAdmin(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    return user?.role === "ADMIN";
  }

  /** Ids of everyone the account and its follows follow both ways. */
  private async friendIds(userId: string, limit = 500): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a."followingId" AS id
      FROM "Follow" a
      JOIN "Follow" b ON b."followerId" = a."followingId" AND b."followingId" = a."followerId"
      WHERE a."followerId" = ${userId}
      ORDER BY GREATEST(a."createdAt", b."createdAt") DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }

  private async cards(ids: string[], viewerId: string | null): Promise<UserCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids }, isBanned: false }, select: CARD_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r): r is CardRow => r != null);
    return this.decorate(ordered, viewerId);
  }

  /** Cards with how active each one is and how the viewer relates to them. */
  /**
   * People by nick or name, for the search ("find friends"). Matched
   * anywhere in either (ILIKE through the trigram indexes, so no scan of
   * every account), ranked: the exact nick, a nick or a name that starts
   * with it, then by how alike they are, then who was here last. Banned
   * accounts and the viewer themselves are left out. "@nick" works too.
   */
  async searchPeople(raw: string, viewerId: string | null, limit = 12): Promise<UserCard[]> {
    const q = raw.trim().replace(/^@+/, "").slice(0, 60);
    if (q.length < 2) return [];
    // LIKE's own wildcards in a name are searched for as themselves.
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const anywhere = `%${escaped}%`;
    const prefix = `${escaped}%`;
    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "isBanned" = false
        AND "id" <> ${viewerId ?? ""}
        AND ("username" ILIKE ${anywhere} OR "displayName" ILIKE ${anywhere})
      ORDER BY
        (lower(coalesce("username", '')) = lower(${q})) DESC,
        (coalesce("username", '') ILIKE ${prefix} OR "displayName" ILIKE ${prefix}) DESC,
        greatest(similarity(coalesce("username", ''), ${q}), similarity("displayName", ${q})) DESC,
        "lastSeenAt" DESC NULLS LAST
      LIMIT ${limit}`;
    if (hits.length === 0) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: hits.map((h) => h.id) } }, select: CARD_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return this.decorate(
      hits.map((h) => byId.get(h.id)).filter((r): r is CardRow => r != null),
      viewerId,
    );
  }

  private async decorate(rows: CardRow[], viewerId: string | null): Promise<UserCard[]> {
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.id))];
    const [episodes, viewerFollows, followViewer] = await Promise.all([
      this.prisma.watchProgress.groupBy({ by: ["userId"], where: { userId: { in: ids }, completed: true }, _count: { _all: true } }),
      viewerId
        ? this.prisma.follow.findMany({ where: { followerId: viewerId, followingId: { in: ids } }, select: { followingId: true } })
        : Promise.resolve([]),
      viewerId
        ? this.prisma.follow.findMany({ where: { followingId: viewerId, followerId: { in: ids } }, select: { followerId: true } })
        : Promise.resolve([]),
    ]);
    const eps = new Map(episodes.map((e) => [e.userId, e._count._all]));
    const following = new Set(viewerFollows.map((f) => f.followingId));
    const followsYou = new Set(followViewer.map((f) => f.followerId));
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      isPro: proActive(r),
      onlineStatus: (r.onlineStatus as UserCard["onlineStatus"]) ?? "OFFLINE",
      episodes: eps.get(r.id) ?? 0,
      avatarFrame: r.avatarFrame as UserCard["avatarFrame"],
      profileTitle: r.profileTitle as UserCard["profileTitle"],
      // PRO-only, as on the profile: a lapsed subscription shows no custom title.
      titlePrefix: proActive(r) || r.titleUnlocked ? r.titlePrefix : null,
      titleIcon: proActive(r) || r.titleUnlocked ? (r.titleIcon as UserCard["titleIcon"]) : null,
      following: following.has(r.id),
      followsYou: followsYou.has(r.id),
    }));
  }

  private toPost(
    row: { id: string; body: string; createdAt: Date; authorId: string },
    author: UserCard,
    viewerId: string | null,
    ownerId: string,
    isAdmin: boolean,
  ): WallPost {
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author,
      canDelete: viewerId != null && (viewerId === row.authorId || viewerId === ownerId || isAdmin),
    };
  }
}
