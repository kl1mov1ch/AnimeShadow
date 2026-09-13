const VISITOR_ID_KEY = "animeshadow.visitor";
const REFERRER_KEY = "animeshadow.referrer";

/** A random id kept in localStorage — never tied to an account or IP — so
 * anonymous traffic can still be counted as "one visitor across N page
 * views" without storing anything personally identifying. */
export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    // Private browsing / blocked storage — fall back to a per-load id
    // rather than crashing the beacon.
    return crypto.randomUUID();
  }
}

/**
 * `document.referrer` as it was on the very first page of this visit,
 * captured once and reused after — so someone who browses a few pages
 * before registering is still attributed to how they actually arrived,
 * not to whatever internal page they happened to sign up from.
 */
export function getFirstTouchReferrer(): string {
  try {
    const stored = localStorage.getItem(REFERRER_KEY);
    if (stored !== null) return stored;
    const referrer = document.referrer || "";
    localStorage.setItem(REFERRER_KEY, referrer);
    return referrer;
  } catch {
    return document.referrer || "";
  }
}
