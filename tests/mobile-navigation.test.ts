import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MOBILE_NAVIGATION, mobileNavigationSchema, normalizeMobileNavigation, replaceNavigationItem } from "../packages/shared/src/mobile-navigation.ts";

test("five unique shortcuts include a movable search button", () => {
  assert.ok(mobileNavigationSchema.safeParse({ buttons: DEFAULT_MOBILE_NAVIGATION }).success);
  assert.ok(mobileNavigationSchema.safeParse({ buttons: ["search", "catalog", "notifications", "library", "support"] }).success);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["search", "catalog", "notifications", "library", "settings"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["frameSearch", "notifications", "library", "settings"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "home", "rooms", "profile"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "search", "rooms", "profile"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "catalog", "rooms", "profile", "settings"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "search", "rooms", "profile", "search"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "catalog"] }).success, false);
  assert.equal(mobileNavigationSchema.safeParse({ buttons: ["home", "catalog", "rooms", "javascript:alert(1)"] }).success, false);
});

test("hidden frame search is replaced in saved accounts, preserving other shortcuts", () => {
  assert.deepEqual(normalizeMobileNavigation({ buttons: ["home", "frameSearch", "notifications", "profile"] }).buttons, ["home", "catalog", "search", "notifications", "profile"]);
  assert.deepEqual(normalizeMobileNavigation({ buttons: ["catalog", "frameSearch", "catalog", "settings"] }).buttons, ["catalog", "home", "search", "rooms", "profile"]);
  assert.deepEqual(normalizeMobileNavigation({ buttons: ["search", "catalog", "notifications", "library", "settings"] }).buttons, ["search", "catalog", "notifications", "library", "home"]);
  assert.ok(mobileNavigationSchema.safeParse(normalizeMobileNavigation({ buttons: ["home", "catalog", "rooms", "profile", "settings"] })).success);
  assert.deepEqual(normalizeMobileNavigation(null).buttons, DEFAULT_MOBILE_NAVIGATION);
});

test("choosing an existing shortcut swaps positions and never mutates defaults", () => {
  const next = replaceNavigationItem(DEFAULT_MOBILE_NAVIGATION, 0, "profile");
  assert.deepEqual(next, ["profile", "catalog", "search", "rooms", "home"]);
  assert.deepEqual(DEFAULT_MOBILE_NAVIGATION, ["home", "catalog", "search", "rooms", "profile"]);
  assert.deepEqual(replaceNavigationItem(next, 3, "notifications"), ["profile", "catalog", "search", "notifications", "home"]);
  assert.deepEqual(replaceNavigationItem(next, 0, "search"), ["search", "catalog", "profile", "rooms", "home"]);
  assert.deepEqual(replaceNavigationItem(next, 2, "notifications"), next);
  assert.ok(mobileNavigationSchema.safeParse({ buttons: next }).success);
});
