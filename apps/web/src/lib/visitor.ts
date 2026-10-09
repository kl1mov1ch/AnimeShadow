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

const SESSION_KEY = "animeshadow.session";
const UTM_KEY = "animeshadow.utm";
/** A session ends after half an hour with no page views. */
const SESSION_IDLE_MS = 30 * 60_000;

export interface VisitSession {
  id: string;
  /** This page view starts the session. */
  entry: boolean;
  /** The other site that sent this session, if any. */
  referrer: string | undefined;
}

/**
 * The current visit, kept in localStorage so every tab shares it: a new
 * one starts after 30 idle minutes. Its referrer is document.referrer at
 * the start, kept only when it is another site.
 */
export function touchSession(): VisitSession {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const stored = raw ? (JSON.parse(raw) as { id: string; at: number; ref?: string }) : null;
    if (stored && now - stored.at < SESSION_IDLE_MS) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...stored, at: now }));
      return { id: stored.id, entry: false, referrer: stored.ref };
    }
    const ref = externalReferrer();
    const fresh = { id: crypto.randomUUID(), at: now, ref };
    localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
    return { id: fresh.id, entry: true, referrer: ref };
  } catch {
    return { id: crypto.randomUUID(), entry: true, referrer: externalReferrer() };
  }
}

function externalReferrer(): string | undefined {
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    return new URL(ref).host === window.location.host ? undefined : ref;
  } catch {
    return undefined;
  }
}

export interface Utm {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** utm_* tags from the URL the visit landed on, remembered for the session. */
export function getUtm(): Utm {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Utm = {
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
    };
    if (fromUrl.utmSource || fromUrl.utmMedium || fromUrl.utmCampaign) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = sessionStorage.getItem(UTM_KEY);
    return stored ? (JSON.parse(stored) as Utm) : {};
  } catch {
    return {};
  }
}
