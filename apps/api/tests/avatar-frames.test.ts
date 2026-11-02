import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@animeshadow/db";
import {
  AVATAR_FRAMES,
  DEFAULT_PROFILE_PRIVACY,
  SHADOW_AVATAR_FRAMES,
  avatarFrameSchema,
  cosmeticUnlocked,
  effectiveAvatarFrame,
  PROFILE_TITLES,
  isEarlyAdopter,
  updateProfileInputSchema,
  type EarnedAchievement,
  type ProfileStats,
} from "@animeshadow/shared";

// Importing the API constructs its Prisma singleton. Every query in this suite
// is replaced below; the unused URL keeps the tests independent of a local DB.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/avatar_frame_tests";
const { ProfileService } = await import("../src/services/profile.service.js");
const { AchievementService } = await import("../src/services/achievement.service.js");
const { AuthService } = await import("../src/services/auth.service.js");
const { SocialService } = await import("../src/services/social.service.js");

const stats: ProfileStats = {
  episodesWatched: 0,
  hoursWatched: 0,
  titlesCompleted: 0,
  meanScore: null,
  topGenres: [],
  mostProductiveDay: null,
  avgSessionMinutes: null,
  dailyActivity: [],
  topRated: [],
};
const earlyAchievement: EarnedAchievement = {
  id: "early-adopter",
  earned: true,
  earnedAt: null,
  secret: false,
  manual: false,
  rarity: "epic",
  category: "special",
  progress: null,
};

function fillPlayback(rows: { userId: string; animeId: number; episode: number; _sum: { rewardSeconds: number } }[], animeId: number, qualifiedEpisodes: number) {
  const rule = SHADOW_AVATAR_FRAMES.find((frame) => "watchAnime" in frame && frame.watchAnime.animeId === animeId)!;
  if (!("watchAnime" in rule)) throw new Error("Missing watch rule");
  for (let episode = 1; episode <= qualifiedEpisodes; episode++) {
    const value = Math.ceil(rule.watchAnime.episodeSeconds / 2);
    rows.push({ userId: "owner", animeId, episode, _sum: { rewardSeconds: value } });
  }
}

function fixture() {
  const user = {
    id: "owner",
    username: "shadow",
    email: "shadow@example.invalid",
    displayName: "Shadow",
    bio: null,
    avatarUrl: null,
    bannerUrl: null,
    accentColor: null,
    onlineStatus: "OFFLINE",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    favoriteAnimeIds: [],
    showcaseAchievementIds: [],
    profilePrivacy: { ...DEFAULT_PROFILE_PRIVACY },
    profileLayout: null,
    profileViews: 0,
    avatarFrame: "shadow-standard" as string | null,
    profileTitle: null as string | null,
    titlePrefix: null,
    titleIcon: null,
    titleUnlocked: false,
    bonusXp: 0,
    theme: null,
    birthDate: null,
    proSince: null as Date | null,
    proUntil: null as Date | null,
    trialUntil: null as Date | null,
    role: "USER",
    emailVerifiedAt: null,
    telegramId: null,
    isBanned: false,
  };
  const achievements: EarnedAchievement[] = [];
  const weeklyReceipts: { userId: string; place: number; weekStart: Date; awardedAt: Date }[] = [];
  const monthlyReceipts: { userId: string; place: number; monthStart: Date; awardedAt: Date }[] = [];
  const playback: { userId: string; animeId: number; episode: number; _sum: { rewardSeconds: number } }[] = [];
  let writes = 0;
  let weeklyReads = 0;
  let monthlyReads = 0;
  let episodeReads = 0;
  const prisma = {
    watchProgress: { groupBy: async () => [] },
    user: {
      findUnique: async () => user,
      findUniqueOrThrow: async () => user,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes++;
        Object.assign(user, data);
        return user;
      },
    },
    weeklyWatchReward: { findMany: async () => {
      weeklyReads++;
      return [...weeklyReceipts].sort((a, b) => a.place - b.place || b.awardedAt.getTime() - a.awardedAt.getTime());
    } },
    monthlyWatchAward: { findMany: async () => {
      monthlyReads++;
      return [...monthlyReceipts].sort((a, b) => a.place - b.place || b.awardedAt.getTime() - a.awardedAt.getTime());
    } },
    watchSession: { groupBy: async ({ by, where }: { by: string[]; where: Record<string, unknown> }) => {
      if (!by.includes("animeId")) return [];
      episodeReads++;
      assert.deepEqual(where.rewardSeconds, { gt: 0 });
      assert.deepEqual(where.endedAt, { not: null });
      assert.deepEqual(where.episode, { gte: 1 });
      return playback;
    } },
  } as unknown as PrismaClient;
  const service = new ProfileService({
    prisma,
    achievements: { list: async () => achievements } as unknown as InstanceType<typeof AchievementService>,
    uploadsRoot: "unused-test-uploads",
  });
  // Isolate frame authorization from unrelated aggregate queries, preserving
  // the actual public read/write methods and the profile privacy pipeline.
  service["computeStats"] = async () => stats;
  service["getCommenterStanding"] = async () => ({ totalLikes: 0, rank: null, totalRanked: 0 });
  service["counters"] = async () => ({ rated: 0, listed: 0, comments: 0, followers: 0, friends: 0 });
  return { user, achievements, prisma, service, weeklyReceipts, monthlyReceipts, playback,
    writes: () => writes, reads: () => ({ weeklyReads, monthlyReads, episodeReads }) };
}

test("gallery contains thirty-two current frames, while legacy IDs and resets remain accepted", () => {
  assert.deepEqual(SHADOW_AVATAR_FRAMES.map((frame) => frame.id), [
    "shadow-standard", "shadow-pro", "shadow-founder", "shadow-one-piece",
    "shadow-jujutsu", "shadow-tokyo-ghoul", "shadow-black-clover", "shadow-frieren",
    "shadow-naruto", "shadow-demon-slayer", "shadow-attack-on-titan",
    "shadow-death-note", "shadow-chainsaw-man", "shadow-halloween-pumpkin",
    "shadow-halloween-witch", "shadow-weekly", "shadow-halloween-zombie",
    "shadow-halloween-phantom", "shadow-monthly",
    "shadow-culling", "shadow-hells-paradise", "shadow-dorohedoro", "shadow-witch-atelier", "shadow-reze",
    "shadow-solo-jinwoo", "shadow-solo-beru", "shadow-sylphie", "shadow-eris", "shadow-roxy",
    "shadow-gojo", "shadow-hunter", "shadow-akame",
  ]);
  for (const id of ["sakura", "aurora", "sovereign", "none", ...SHADOW_AVATAR_FRAMES.map((frame) => frame.id)]) {
    assert.equal(avatarFrameSchema.parse(id), id);
    assert.equal(updateProfileInputSchema.parse({ avatarFrame: id }).avatarFrame, id);
  }
  assert.equal(updateProfileInputSchema.parse({ avatarFrame: null }).avatarFrame, null);
  assert.equal(avatarFrameSchema.safeParse("invented-frame").success, false);
  assert.equal(effectiveAvatarFrame("invented-frame", { earnedIds: [], level: 1, pro: false }), null);
  assert.equal(effectiveAvatarFrame("sovereign", { earnedIds: [], level: 1, pro: false }), "sovereign");
});

test("all twenty-three anime frames require distinct half-watched episodes, regardless of PRO or manual episode flags", async () => {
  const f = fixture();
  f.user.createdAt = new Date("2027-03-01T00:00:00Z");
  const animeFrames = SHADOW_AVATAR_FRAMES.filter((frame) => "watchAnime" in frame);
  assert.equal(animeFrames.length, 23);
  for (const frame of animeFrames) {
    // Character frames can share a title: each gate must also be tested empty.
    f.playback.length = 0;
    await assert.rejects(f.service.update("owner", { avatarFrame: frame.id }), /ещё не открыта/);
    const { animeId, requiredEpisodes } = frame.watchAnime;
    fillPlayback(f.playback, animeId, requiredEpisodes);
    f.playback.at(-1)!._sum.rewardSeconds--;
    await assert.rejects(f.service.update("owner", { avatarFrame: frame.id }), /ещё не открыта/);
    const before = (await f.service.getMine("owner")).frameWatchProgress?.find((entry) => entry.animeId === animeId);
    assert.equal(before?.qualifiedEpisodes, requiredEpisodes - 1);
    assert.equal(before?.requiredEpisodes, requiredEpisodes);
    f.playback.at(-1)!._sum.rewardSeconds++;
    const mine = await f.service.update("owner", updateProfileInputSchema.parse({ avatarFrame: frame.id }));
    assert.equal(mine.avatarFrame, frame.id);
    assert.equal(mine.selectedAvatarFrame, frame.id);
    assert.equal(mine.frameWatchProgress?.find((entry) => entry.animeId === animeId)?.qualifiedEpisodes, requiredEpisodes);
    assert.equal((await f.service.getById("owner")).avatarFrame, frame.id);
  }
  assert.equal((await f.service.getMine("owner")).frameWatchProgress?.length, 22);
  assert.equal("frameWatchProgress" in await f.service.getById("owner"), false);
});

test("Gojo and Jujutsu share the same verified episodes and exactly one progress entry", async () => {
  const f = fixture();
  fillPlayback(f.playback, 40748, 24);
  f.playback.at(-1)!._sum.rewardSeconds--;
  for (const avatarFrame of ["shadow-jujutsu", "shadow-gojo"]) {
    await assert.rejects(f.service.update("owner", { avatarFrame }), /ещё не открыта/);
  }
  const before = (await f.service.getMine("owner")).frameWatchProgress!.filter((entry) => entry.animeId === 40748);
  assert.equal(before.length, 1);
  assert.equal(before[0]!.qualifiedEpisodes, 23);
  assert.equal(before[0]!.requiredEpisodes, 24);
  f.playback.at(-1)!._sum.rewardSeconds++;
  for (const avatarFrame of ["shadow-jujutsu", "shadow-gojo"]) {
    const mine = await f.service.update("owner", { avatarFrame });
    assert.equal(mine.avatarFrame, avatarFrame);
    assert.equal(mine.selectedAvatarFrame, avatarFrame);
    const shared = mine.frameWatchProgress!.filter((entry) => entry.animeId === 40748);
    assert.equal(shared.length, 1);
    assert.equal(shared[0]!.qualifiedEpisodes, 24);
    assert.equal(shared[0]!.requiredEpisodes, 24);
  }
});

test("all four Halloween frames remain available without watching, PRO or early access", async () => {
  const f = fixture();
  f.user.createdAt = new Date("2027-03-01T00:00:00Z");
  const frames = SHADOW_AVATAR_FRAMES.filter((frame) => frame.id.startsWith("shadow-halloween-"));
  assert.equal(frames.length, 4);
  for (const frame of frames) {
    assert.equal((await f.service.update("owner", { avatarFrame: frame.id })).avatarFrame, frame.id);
  }
});

test("weekly and monthly frames require actual receipts; podium titles unlock exact historical places only", async () => {
  const f = fixture();
  for (const id of ["shadow-weekly", "shadow-monthly"]) {
    await assert.rejects(f.service.update("owner", { avatarFrame: id }), /ещё не открыта/);
  }
  for (const place of [1, 2, 3]) {
    await assert.rejects(f.service.update("owner", { profileTitle: `weekly-watch-${place}` }), /ещё не открыта/);
  }
  const weekStart = new Date("2026-10-25T21:00:00Z");
  const awardedAt = new Date("2026-11-02T00:00:00Z");
  f.weeklyReceipts.push({ userId: "owner", place: 999, weekStart, awardedAt });
  assert.equal((await f.service.update("owner", { avatarFrame: "shadow-weekly" })).weeklyWatchAward?.place, 999);
  await assert.rejects(f.service.update("owner", { profileTitle: "weekly-watch-3" }), /ещё не открыта/);
  f.weeklyReceipts.push({ userId: "owner", place: 3, weekStart, awardedAt });
  assert.equal((await f.service.update("owner", { profileTitle: "weekly-watch-3" })).profileTitle, "weekly-watch-3");
  await assert.rejects(f.service.update("owner", { profileTitle: "weekly-watch-2" }), /ещё не открыта/);
  const later = new Date("2026-11-09T00:00:00Z");
  f.weeklyReceipts.push({ userId: "owner", place: 3, weekStart: new Date("2026-11-01T21:00:00Z"), awardedAt: later });
  f.weeklyReceipts.push({ userId: "owner", place: 2, weekStart, awardedAt });
  f.monthlyReceipts.push({ userId: "owner", place: 812, monthStart: new Date("2026-09-30T21:00:00Z"), awardedAt });
  f.user.profilePrivacy = { ...DEFAULT_PROFILE_PRIVACY, stats: "private", achievements: "private", watching: "private" };
  const mine = await f.service.update("owner", { avatarFrame: "shadow-monthly" });
  assert.equal(mine.avatarFrame, "shadow-monthly");
  assert.deepEqual(mine.weeklyWatchPlaces, [2, 3]);
  assert.equal(mine.weeklyWatchAward?.place, 2);
  assert.equal(mine.monthlyWatchAward?.place, 812);
  assert.equal((await f.service.update("owner", { profileTitle: "weekly-watch-2" })).profileTitle, "weekly-watch-2");
  const publicProfile = await f.service.getById("owner");
  assert.equal(publicProfile.monthlyWatchAward?.place, 812);
  assert.deepEqual(publicProfile.weeklyWatchPlaces, [2, 3]);
  assert.equal(publicProfile.hidden.stats, true);
  f.monthlyReceipts.push({ userId: "owner", place: 900, monthStart: new Date("2026-10-31T21:00:00Z"), awardedAt: later });
  assert.equal((await f.service.getMine("owner")).monthlyWatchAward?.place, 812, "a newer worse result does not replace the best medal");
  f.monthlyReceipts.push({ userId: "owner", place: 812, monthStart: new Date("2026-10-31T21:00:00Z"), awardedAt: later });
  assert.equal((await f.service.getMine("owner")).monthlyWatchAward?.monthStart, "2026-10-31T21:00:00.000Z");
  f.user.profilePrivacy.profile = "private";
  const hiddenProfile = await f.service.getById("owner");
  assert.equal(hiddenProfile.hidden.profile, true);
  assert.equal(hiddenProfile.avatarFrame, "shadow-monthly");
  assert.equal(hiddenProfile.monthlyWatchAward?.place, 812);
  f.weeklyReceipts.splice(f.weeklyReceipts.findIndex((row) => row.place === 2), 1);
  assert.equal((await f.service.getMine("owner")).weeklyWatchAward?.awardedAt, later.toISOString());
  assert.equal((await f.service.getMine("owner")).profileTitle, null, "a forged saved title without its receipt is hidden");
  for (const invalid of [0, 1000, 1.5, NaN]) {
    assert.equal(cosmeticUnlocked(AVATAR_FRAMES, "shadow-weekly", { earnedIds: [], level: 1, pro: true, weeklyWatchPlace: invalid }), false);
    assert.equal(cosmeticUnlocked(AVATAR_FRAMES, "shadow-monthly", { earnedIds: [], level: 1, pro: true, monthlyWatchPlace: invalid }), false);
  }
  assert.equal(cosmeticUnlocked(PROFILE_TITLES, "weekly-watch-1", { earnedIds: [], level: 1, pro: true, weeklyWatchPlace: 1, weeklyWatchPlaces: [2, 3] }), false);
});

test("early access uses the same strict cutoff as the existing achievement", () => {
  const service = new AchievementService({ prisma: {} as PrismaClient });
  for (const [date, expected] of [
    ["2027-02-28T23:59:59.999Z", true],
    ["2027-03-01T00:00:00Z", false],
    ["2027-03-01T03:00:00+03:00", false],
  ] as const) {
    assert.equal(isEarlyAdopter(date), expected);
    assert.equal(service["evaluate"]("early-adopter", { createdAt: new Date(date) } as Parameters<typeof service["evaluate"]>[1]).earned, expected);
    assert.equal(cosmeticUnlocked(AVATAR_FRAMES, "shadow-founder", { earnedIds: [], level: 1, pro: false, memberSince: date }), expected);
  }
  assert.equal(isEarlyAdopter("bad-date"), false);
  assert.equal(cosmeticUnlocked(AVATAR_FRAMES, "shadow-founder", ["early-adopter"]), true);
});

test("server rejects forged PRO and founder saves, and permits standard for everyone", async () => {
  const f = fixture();
  f.user.createdAt = new Date("2027-03-01T00:00:00Z");
  for (const id of ["shadow-pro", "shadow-founder", "invented-frame"]) {
    await assert.rejects(f.service.update("owner", { avatarFrame: id }), /ещё не открыта/);
  }
  assert.equal(f.writes(), 0);
  assert.equal((await f.service.update("owner", { avatarFrame: "shadow-standard" })).avatarFrame, "shadow-standard");
  f.user.createdAt = new Date("2027-02-28T23:59:59.999Z");
  assert.equal((await f.service.update("owner", { avatarFrame: "shadow-founder" })).avatarFrame, "shadow-founder");
});

test("trial, permanent and temporary PRO work; expiry falls back without losing the saved choice", async () => {
  const f = fixture();
  f.user.trialUntil = new Date("2100-01-01T00:00:00Z");
  assert.equal((await f.service.update("owner", { avatarFrame: "shadow-pro" })).avatarFrame, "shadow-pro");
  f.user.trialUntil = new Date("2000-01-01T00:00:00Z");
  const readsBefore = f.writes();
  const mine = await f.service.getMine("owner");
  assert.equal(mine.avatarFrame, "shadow-standard");
  assert.equal(mine.selectedAvatarFrame, "shadow-pro");
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-standard");
  assert.equal(f.user.avatarFrame, "shadow-pro");
  assert.equal(f.writes(), readsBefore);
  f.user.proSince = new Date("2026-01-01T00:00:00Z");
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-pro");
  f.user.proUntil = new Date("2100-01-01T00:00:00Z");
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-pro");
  f.user.proUntil = new Date("2000-01-01T00:00:00Z");
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-standard");
  f.user.avatarFrame = "aurora";
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-standard");
});

test("hidden achievements still authorize the owner's frame without leaking through the public DTO", async () => {
  const f = fixture();
  f.user.createdAt = new Date("2027-03-01T00:00:00Z");
  f.achievements.push(earlyAchievement);
  f.user.profilePrivacy = { ...DEFAULT_PROFILE_PRIVACY, achievements: "private" };
  await f.service.update("owner", { avatarFrame: "shadow-founder" });
  const publicProfile = await f.service.getById("owner");
  assert.equal(publicProfile.avatarFrame, "shadow-founder");
  assert.deepEqual(publicProfile.achievements, []);
  assert.equal(publicProfile.hidden.achievements, true);
  assert.equal("selectedAvatarFrame" in publicProfile, false);
  assert.equal((await f.service.getMine("owner")).achievements[0]?.id, "early-adopter");
});

test("auth and social cards apply the same expiry fallback as profile reads", async () => {
  const f = fixture();
  f.user.avatarFrame = "shadow-pro";
  const auth = new AuthService({ prisma: f.prisma, uploadsDir: "unused-test-uploads", email: {} as ConstructorParameters<typeof AuthService>[0]["email"] });
  const social = new SocialService({ prisma: f.prisma, insights: {} as ConstructorParameters<typeof SocialService>[0]["insights"] });
  for (const active of [false, true]) {
    f.user.trialUntil = new Date(active ? "2100-01-01T00:00:00Z" : "2000-01-01T00:00:00Z");
    const expected = active ? "shadow-pro" : "shadow-standard";
    assert.equal((await auth.getById("owner")).avatarFrame, expected);
    const [card] = await social["decorate"]([f.user], null);
    assert.equal(card?.avatarFrame, expected);
  }
  f.user.avatarFrame = "shadow-founder";
  assert.equal((await auth.getById("owner")).avatarFrame, "shadow-founder");
  assert.equal((await social["decorate"]([f.user], null))[0]?.avatarFrame, "shadow-founder");
});

test("auth/social validate weekly, monthly and anime frames, with one entitlement query per card batch", async () => {
  const f = fixture();
  const auth = new AuthService({ prisma: f.prisma, uploadsDir: "unused-test-uploads", email: {} as ConstructorParameters<typeof AuthService>[0]["email"] });
  const social = new SocialService({ prisma: f.prisma, insights: {} as ConstructorParameters<typeof SocialService>[0]["insights"] });
  const date = new Date("2026-11-01T00:00:00Z");
  f.weeklyReceipts.push({ userId: "owner", place: 981, weekStart: date, awardedAt: date });
  f.monthlyReceipts.push({ userId: "owner", place: 512, monthStart: date, awardedAt: date });
  for (const id of ["shadow-weekly", "shadow-monthly", "shadow-death-note"]) {
    f.user.avatarFrame = id;
    const expected = id === "shadow-death-note" ? "shadow-standard" : id;
    const user = await auth.getById("owner");
    assert.equal(user.avatarFrame, expected);
    assert.equal(user.weeklyWatchPlace, 981);
    assert.equal(user.monthlyWatchPlace, 512);
    const before = f.reads();
    const cards = await social["decorate"]([f.user, { ...f.user, id: "other" }], null);
    const after = f.reads();
    assert.equal(after.weeklyReads - before.weeklyReads, 1);
    assert.equal(after.monthlyReads - before.monthlyReads, 1);
    assert.equal(after.episodeReads - before.episodeReads, 1);
    assert.equal(cards[0]?.avatarFrame, expected);
    assert.equal(cards[1]?.avatarFrame, "shadow-standard");
  }
  fillPlayback(f.playback, 1535, 24);
  assert.equal((await auth.getById("owner")).avatarFrame, "shadow-death-note");
  assert.equal((await social["decorate"]([f.user], null))[0]?.avatarFrame, "shadow-death-note");
  f.user.profilePrivacy = { ...DEFAULT_PROFILE_PRIVACY, stats: "private", watching: "private" };
  assert.equal((await f.service.getById("owner")).avatarFrame, "shadow-death-note");
});
