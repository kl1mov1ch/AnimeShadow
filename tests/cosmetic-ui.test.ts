import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cosmeticUnlocked,
  PROFILE_TITLES,
  SHADOW_AVATAR_FRAMES,
  type PublicProfile,
} from "../packages/shared/src/index.ts";
import {
  profileCosmeticContext,
  requirementProgress,
  requirementText,
} from "../apps/web/src/lib/cosmetics.ts";

const profile = {
  achievements: [],
  isPro: false,
  memberSince: "2028-01-01T00:00:00Z",
  weeklyWatchAward: { place: 2 },
  weeklyWatchPlaces: [2],
  monthlyWatchAward: { place: 77 },
} as unknown as PublicProfile;

test("public cosmetic previews use actual receipts without inventing private anime progress", () => {
  const context = profileCosmeticContext(profile);
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-weekly", context), true);
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-monthly", context), true);
  assert.equal(cosmeticUnlocked(PROFILE_TITLES, "weekly-watch-2", context), true);
  assert.equal(cosmeticUnlocked(PROFILE_TITLES, "weekly-watch-1", context), false);
  assert.equal(
    cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-one-piece", context),
    false,
  );
  assert.deepEqual(context.animeQualifiedEpisodes, {});
});

test("the owner's anime progress respects the exact title and verified-time boundary", () => {
  const own = {
    ...profile,
    frameWatchProgress: [{ animeId: 21, watchedSeconds: 16560, requiredSeconds: 17280, qualifiedEpisodes: 23, requiredEpisodes: 24 }],
  };
  const context = profileCosmeticContext(own);
  const frame = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-one-piece")!;
  assert.deepEqual(requirementProgress(frame, 1, undefined, context), {
    current: 23,
    target: 24,
  });
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, context), false);
  context.animeQualifiedEpisodes = { 21: 24 };
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, context), true);
  assert.equal(cosmeticUnlocked(SHADOW_AVATAR_FRAMES, "shadow-naruto", context), false);
});

test("award and anime instructions identify the correct requirement instead of an early-user fallback", () => {
  const translate = () => "";
  const monthly = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-monthly")!;
  const anime = SHADOW_AVATAR_FRAMES.find((entry) => entry.id === "shadow-one-piece")!;
  assert.match(requirementText(monthly, translate), /календарного месяца/);
  assert.doesNotMatch(requirementText(monthly, translate), /2027|первого дня/);
  assert.match(requirementText(anime, translate), /Посмотреть аниме.*Ван-Пис/);
});
