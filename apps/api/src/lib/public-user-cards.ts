import { Prisma, type PrismaClient } from "@animeshadow/db";
import {
  effectiveAvatarFrame, effectiveProfileTitle, levelOf,
  type DirectoryUserCard, type ProfileStats,
} from "@animeshadow/shared";
import { AchievementService } from "../services/achievement.service.js";
import { animeQualifiedEpisodes, frameWatchProgress } from "./frame-watch-progress.js";
import { weeklyWatchAwards } from "./weekly-watch-awards.js";
import { monthlyWatchAwards } from "./monthly-watch-awards.js";
import { readPrivacy } from "./privacy.js";
import { proActive } from "./pro.js";

const USER_SELECT = {
  id: true, username: true, displayName: true, avatarUrl: true,
  createdAt: true, proSince: true, proUntil: true, trialUntil: true,
  onlineStatus: true, avatarFrame: true, profileTitle: true,
  titlePrefix: true, titleIcon: true, titleUnlocked: true,
  profilePrivacy: true, bio: true, bannerUrl: true, favoriteAnimeIds: true,
  showcaseAchievementIds: true, bonusXp: true,
} satisfies Prisma.UserSelect;

interface Totals {
  userId: string;
  episodes: bigint;
  completed: bigint;
  rated: bigint;
  listed: bigint;
  comments: bigint;
  likes: bigint;
  followers: bigint;
  friends: bigint;
}

/**
 * Public cards share the profile's level formula and achievement rules.
 * Every query handles the complete ID batch; no full-profile calls per card.
 */
export async function publicUserCards(
  prisma: PrismaClient,
  userIds: readonly string[],
  viewerId: string | null = null,
): Promise<Map<string, DirectoryUserCard>> {
  const ids = [...new Set(userIds)];
  const result = new Map<string, DirectoryUserCard>();
  if (ids.length === 0) return result;
  const rows = (await prisma.user.findMany({
    where: { id: { in: ids }, isBanned: false }, select: USER_SELECT,
  })).filter((row) => readPrivacy(row.profilePrivacy).profile === "public");
  if (rows.length === 0) return result;
  const visibleIds = rows.map((row) => row.id);
  const achievementsService = new AchievementService({ prisma });
  const [achievements, progress, weekly, monthly, totals, favoriteIds, follows, followedBy] = await Promise.all([
    achievementsService.listMany(visibleIds),
    frameWatchProgress(prisma, visibleIds),
    weeklyWatchAwards(prisma, visibleIds),
    monthlyWatchAwards(prisma, visibleIds),
    prisma.$queryRaw<Totals[]>`
      WITH selected AS (SELECT unnest(ARRAY[${Prisma.join(visibleIds)}]::text[]) AS id),
      episodes AS (SELECT p."userId", count(*) AS n FROM "WatchProgress" p JOIN selected s ON s.id=p."userId" WHERE p.completed=true GROUP BY p."userId"),
      library AS (SELECT l."userId", count(*) AS listed, count(*) FILTER (WHERE l.status='COMPLETED') AS completed, count(*) FILTER (WHERE l.score IS NOT NULL) AS rated FROM "LibraryEntry" l JOIN selected s ON s.id=l."userId" GROUP BY l."userId"),
      comments AS (SELECT c."userId", count(*) AS n, COALESCE(sum(c."likeCount"),0) AS likes FROM "Comment" c JOIN selected s ON s.id=c."userId" WHERE c."deletedAt" IS NULL GROUP BY c."userId"),
      followers AS (SELECT f."followingId" AS "userId", count(*) AS n FROM "Follow" f JOIN selected s ON s.id=f."followingId" GROUP BY f."followingId"),
      friends AS (SELECT a."followerId" AS "userId", count(*) AS n FROM "Follow" a JOIN selected s ON s.id=a."followerId" JOIN "Follow" b ON b."followerId"=a."followingId" AND b."followingId"=a."followerId" GROUP BY a."followerId")
      SELECT s.id AS "userId", COALESCE(e.n,0)::bigint AS episodes,
        COALESCE(l.completed,0)::bigint AS completed, COALESCE(l.rated,0)::bigint AS rated,
        COALESCE(l.listed,0)::bigint AS listed, COALESCE(c.n,0)::bigint AS comments,
        COALESCE(c.likes,0)::bigint AS likes, COALESCE(f.n,0)::bigint AS followers,
        COALESCE(fr.n,0)::bigint AS friends
      FROM selected s LEFT JOIN episodes e ON e."userId"=s.id
      LEFT JOIN library l ON l."userId"=s.id LEFT JOIN comments c ON c."userId"=s.id
      LEFT JOIN followers f ON f."userId"=s.id LEFT JOIN friends fr ON fr."userId"=s.id
    `,
    prisma.anime.findMany({ where: { id: { in: [...new Set(rows.flatMap((row) => row.favoriteAnimeIds))] } }, select: { id: true } }),
    viewerId ? prisma.follow.findMany({ where: { followerId: viewerId, followingId: { in: visibleIds } }, select: { followingId: true } }) : Promise.resolve([]),
    viewerId ? prisma.follow.findMany({ where: { followingId: viewerId, followerId: { in: visibleIds } }, select: { followerId: true } }) : Promise.resolve([]),
  ]);
  const existingFavorites = new Set(favoriteIds.map((row) => row.id));
  const following = new Set(follows.map((row) => row.followingId));
  const followsYou = new Set(followedBy.map((row) => row.followerId));
  const totalsById = new Map(totals.map((row) => [row.userId, row]));
  for (const row of rows) {
    const counts = totalsById.get(row.id);
    const earned = achievements.get(row.id) ?? [];
    const cosmetics = {
      earnedIds: earned.filter((entry) => entry.earned).map((entry) => entry.id),
      level: 1, pro: proActive(row), memberSince: row.createdAt.toISOString(),
      weeklyWatchPlace: weekly.get(row.id)?.award?.place,
      weeklyWatchPlaces: weekly.get(row.id)?.places,
      monthlyWatchPlace: monthly.get(row.id)?.place,
      animeQualifiedEpisodes: animeQualifiedEpisodes(progress.get(row.id)),
    };
    const episodes = Number(counts?.episodes ?? 0);
    const completed = Number(counts?.completed ?? 0);
    const stats: ProfileStats = { episodesWatched: episodes, titlesCompleted: completed, hoursWatched: 0,
      meanScore: null, topGenres: [], mostProductiveDay: null, avgSessionMinutes: null, dailyActivity: [], topRated: [] };
    const xp = levelOf({
      achievements: earned, stats, totalCommentLikes: Number(counts?.likes ?? 0),
      favorites: row.favoriteAnimeIds.filter((id) => existingFavorites.has(id)),
      showcaseAchievementIds: row.showcaseAchievementIds.filter((id) => cosmetics.earnedIds.includes(id)),
      avatarUrl: row.avatarUrl, bannerUrl: row.bannerUrl, bio: row.bio, bonusXp: row.bonusXp, hiddenXp: 0,
      counters: { rated: Number(counts?.rated ?? 0), listed: Number(counts?.listed ?? 0), comments: Number(counts?.comments ?? 0), followers: Number(counts?.followers ?? 0), friends: Number(counts?.friends ?? 0) },
    }).xp;
    const publicStats = readPrivacy(row.profilePrivacy).stats === "public";
    result.set(row.id, {
      id: row.id, username: row.username, displayName: row.displayName, avatarUrl: row.avatarUrl,
      isPro: cosmetics.pro, onlineStatus: row.onlineStatus as DirectoryUserCard["onlineStatus"],
      episodes: publicStats ? episodes : null, titlesCompleted: publicStats ? completed : null, xp,
      avatarFrame: effectiveAvatarFrame(row.avatarFrame, cosmetics),
      profileTitle: effectiveProfileTitle(row.profileTitle, cosmetics),
      weeklyWatchPlace: cosmetics.weeklyWatchPlace ?? null, monthlyWatchPlace: cosmetics.monthlyWatchPlace ?? null,
      titlePrefix: cosmetics.pro || row.titleUnlocked ? row.titlePrefix : null,
      titleIcon: cosmetics.pro || row.titleUnlocked ? row.titleIcon as DirectoryUserCard["titleIcon"] : null,
      following: following.has(row.id), followsYou: followsYou.has(row.id),
    });
  }
  return result;
}
