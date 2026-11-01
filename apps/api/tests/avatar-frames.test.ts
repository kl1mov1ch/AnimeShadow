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
    profileTitle: null,
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
  let writes = 0;
  const prisma = {
    user: {
      findUnique: async () => user,
      findUniqueOrThrow: async () => user,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes++;
        Object.assign(user, data);
        return user;
      },
    },
    watchProgress: { groupBy: async () => [] },
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
  return { user, achievements, prisma, service, writes: () => writes };
}

test("gallery contains eight current frames, while legacy IDs and resets remain accepted", () => {
  assert.deepEqual(SHADOW_AVATAR_FRAMES.map((frame) => frame.id), [
    "shadow-standard", "shadow-pro", "shadow-founder", "shadow-one-piece",
    "shadow-jujutsu", "shadow-tokyo-ghoul", "shadow-black-clover", "shadow-frieren",
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

test("all five anime frames can be saved and displayed without PRO or early-adopter rights", async () => {
  const f = fixture();
  f.user.createdAt = new Date("2027-03-01T00:00:00Z");
  for (const frame of SHADOW_AVATAR_FRAMES.slice(3)) {
    assert.equal(cosmeticUnlocked(AVATAR_FRAMES, frame.id, { earnedIds: [], level: 1, pro: false }), true);
    const mine = await f.service.update("owner", updateProfileInputSchema.parse({ avatarFrame: frame.id }));
    assert.equal(mine.avatarFrame, frame.id);
    assert.equal(mine.selectedAvatarFrame, frame.id);
    assert.equal((await f.service.getById("owner")).avatarFrame, frame.id);
  }
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
