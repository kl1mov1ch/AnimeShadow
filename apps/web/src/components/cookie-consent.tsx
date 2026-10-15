import { useEffect, useState } from "react";
import { LegalLink } from "@/components/legal/legal-doc";
import { useT } from "@/i18n";

const STORAGE_KEY = "animeshadow.cookie-consent.v1";

/**
 * Fired on the window once a choice is made. Other corner notices wait for
 * it rather than stacking on top of this one: a `storage` event would not do,
 * because it only reaches *other* tabs, never the one that wrote the value.
 */
export const COOKIE_CHOICE_EVENT = "animeshadow:cookie-choice";

/** The banner is gone: counters load unless the visitor once said no. */
export function hasCookieConsent(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "declined";
  } catch {
    return true;
  }
}

/** Whether the visitor has already answered, in this browser. */
export function hasCookieChoice(): boolean {
  // No banner any more, so nothing waits for an answer.
  return true;
}

/**
 * One slim strip at the bottom — a line of text and two buttons, not a card
 * that covers a third of a phone's screen and the posters under it. On a
 * computer it sits in the corner. Shown once; either answer is remembered.
 */
export function CookieConsent() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(STORAGE_KEY) != null;
    } catch {
      /* storage disabled — show it, just won't persist the dismissal */
    }
    if (seen) return;
    // Let the page's own entrance animations settle first.
    const id = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(id);
  }, []);

  /**
   * Both answers are remembered, and remembered distinctly — "declined" is
   * not the same fact as "accepted", even though nothing on the site reads
   * it yet (there is no analytics or ad script gated behind it today). If
   * one ever gets added, this is the flag it has to respect.
   */
  const choose = (accepted: boolean) => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, accepted ? "accepted" : "declined");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT));
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 flex animate-in flex-wrap items-center justify-end gap-x-2 gap-y-1.5 rounded-xl border border-border/60 bg-card/95 py-2 pl-3 pr-2 shadow-lg shadow-black/30 duration-300 fade-in-0 slide-in-from-bottom-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md"
    >
      {/* Beside the buttons where there is room; above them on the narrowest phones. */}
      <p className="min-w-[10rem] flex-1 text-xs leading-snug text-muted-foreground">
        {t("cookies.text")} <LegalLink id="privacy">Подробнее</LegalLink>
      </p>
      {/* Two visible answers — declining is as easy to find as accepting. */}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => choose(false)}
          className="h-8 shrink-0 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          {t("cookies.decline")}
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="h-8 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("cookies.accept")}
        </button>
      </div>
    </div>
  );
}
