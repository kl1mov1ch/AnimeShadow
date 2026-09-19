import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { COOKIE_CHOICE_EVENT, hasCookieChoice } from "@/components/cookie-consent";
import { useT } from "@/i18n";
import { useSlowConnection } from "@/lib/connection";

const DISMISS_KEY = "animeshadow.slow-net-notice.v1";
/** After "got it", stay quiet for a day rather than on every page. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * A snail, drawn inline. The obvious thing here was one of the site's reaction
 * gifs — but this notice only ever appears to someone on a slow connection,
 * and those gifs measured 260KB to 1.2MB. Spending seconds of a weak link to
 * announce that the link is weak would be its own punchline. This costs
 * nothing to download, follows the theme through currentColor, and holds
 * still under reduced motion (see the .snail-* rules in index.css).
 */
function Snail() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden className="h-11 w-14 shrink-0 text-foreground/70">
      <line
        className="snail-trail"
        x1="2"
        y1="44"
        x2="26"
        y2="44"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 5"
        opacity="0.35"
      />
      <g className="snail-crawl">
        <ellipse cx="38" cy="41" rx="20" ry="4.5" fill="currentColor" opacity="0.45" />
        <circle cx="54" cy="37" r="5" fill="currentColor" opacity="0.55" />
        <g className="snail-eye">
          <line x1="52" y1="33" x2="49" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <circle cx="49" cy="22" r="2" fill="currentColor" />
        </g>
        <g className="snail-eye" style={{ animationDelay: "200ms" }}>
          <line x1="56" y1="33" x2="59" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <circle cx="59" cy="22" r="2" fill="currentColor" />
        </g>
        <g className="snail-shell">
          <circle cx="33" cy="29" r="12" fill="var(--primary)" />
          <path
            d="M33 29 m0 -7 a7 7 0 1 1 -7 7 a5 5 0 1 1 5 -5 a3 3 0 1 1 -3 3"
            fill="none"
            stroke="var(--background)"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      </g>
    </svg>
  );
}

/**
 * Tells someone on a slow connection what the site is holding back for them,
 * and that it will come back on its own.
 *
 * Deliberately not a modal: a corner card that never takes focus, never dims
 * the page, and is gone with one click. It waits for the cookie notice to be
 * answered first, so the two never stack in the same corner of a phone, and
 * it disappears by itself if the connection improves — the page starts
 * loading the extras again at the same moment.
 *
 * Connection information only exists in Chromium-based browsers, so this can
 * only ever appear there (see lib/connection.ts).
 */
export function SlowNetworkNotice() {
  const t = useT();
  const slow = useSlowConnection();
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [cookieDone, setCookieDone] = useState(hasCookieChoice);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const onChoice = () => setCookieDone(true);
    window.addEventListener(COOKIE_CHOICE_EVENT, onChoice);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, onChoice);
  }, []);

  // A beat after the page has settled, not on first paint — nothing should
  // pop up in the same instant the page itself is still arriving.
  useEffect(() => {
    if (!slow) {
      setSettled(false);
      return;
    }
    const id = setTimeout(() => setSettled(true), 2_000);
    return () => clearTimeout(id);
  }, [slow]);

  if (!slow || !settled || dismissed || !cookieDone) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage disabled — it just won't stay dismissed across reloads */
    }
  };

  const skipped = [
    t("slowNet.skipped.banners"),
    t("slowNet.skipped.posters"),
    t("slowNet.skipped.openings"),
    t("slowNet.skipped.prefetch"),
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-in slide-in-from-bottom-4 fade-in fixed bottom-3 left-3 z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-border/60 bg-card/95 p-3.5 shadow-lg backdrop-blur duration-500 sm:bottom-5 sm:left-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("slowNet.close")}
        className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>

      <div className="flex items-start gap-3 pr-5">
        <Snail />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold leading-snug">{t("slowNet.title")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("slowNet.body")}</p>
        </div>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {skipped.map((item) => (
          <li
            key={item}
            className="rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground/70">{t("slowNet.returns")}</span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-transform duration-200 hover:scale-105"
        >
          {t("slowNet.gotIt")}
        </button>
      </div>
    </div>
  );
}
