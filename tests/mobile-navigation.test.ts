import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MOBILE_NAVIGATION, mobileNavigationSchema, normalizeMobileNavigation, replaceNavigationItem } from "../packages/shared/src/mobile-navigation.ts";

test("mobile shortcuts are four unique known items, with search reserved for the center", () => {
  assert.ok(mobileNavigationSchema.safeParse({ buttons: DEFAULT_MOBILE_NAVIGATION }).success);
  assert.ok(mobileNavigationSchema.safeParse({ buttons: ["catalog", "notifications", "library", "settings"] }).success);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["frameSearch", "notifications", "library", "settings"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "home", "rooms", "profile"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "search", "rooms", "profile"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "catalog"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "catalog", "rooms", "javascript:alert(1)"] }).success, false);
});

test("hidden frame search is replaced in saved accounts, preserving other shortcuts", () => {
  assert.deepEqual(normalizeMobileNavigation({ buttons: ["home", "frameSearch", "notifications", "profile"] }).buttons, ["home", "catalog", "notifications", "profile"]);
  assert.deepEqual(normalizeMobileNavigation({ buttons: ["catalog", "frameSearch", "catalog", "settings"] }).buttons, ["catalog", "home", "rooms", "settings"]);
  assert.deepEqual(normalizeMobileNavigation(null).buttons, DEFAULT_MOBILE_NAVIGATION);
});

test("choosing an existing shortcut swaps positions and never mutates defaults", () => {
  const next = replaceNavigationItem(DEFAULT_MOBILE_NAVIGATION, 0, "profile");
  assert.deepEqual(next, ["profile", "catalog", "rooms", "home"]);
  assert.deepEqual(DEFAULT_MOBILE_NAVIGATION, ["home", "catalog", "rooms", "profile"]);
  assert.deepEqual(replaceNavigationItem(next, 2, "notifications"), ["profile", "catalog", "notifications", "home"]);
  assert.ok(mobileNavigationSchema.safeParse({ buttons: next }).success);
});
