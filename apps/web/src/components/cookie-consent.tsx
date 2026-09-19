import { CookieIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

const STORAGE_KEY = "animeshadow.cookie-consent.v1";

/**
 * Fired on the window once a choice is made. Other corner notices wait for
 * it rather than stacking on top of this one: a `storage` event would not do,
 * because it only reaches *other* tabs, never the one that wrote the value.
 */
export const COOKIE_CHOICE_EVENT = "animeshadow:cookie-choice";

/** Whether the visitor has already answered, in this browser. */
export function hasCookieChoice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null;
  } catch {
    // Storage disabled: the banner will keep reappearing, so nothing should
    // wait on it forever.
    return true;
  }
}

/**
 * Small, dismissible corner notice — not a full-width bar, not a blocking
 * modal. Anchored to the bottom-right so it never sits over the middle of
 * the viewport (which, on an anime page, is exactly where the player is).
 * Shown once; dismissing it (either button) remembers the choice.
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
      className="animate-in slide-in-from-bottom-4 fade-in fixed bottom-3 right-3 z-50 w-[min(15.5rem,calc(100vw-1.5rem))] rounded-xl border border-border/60 bg-card/95 p-3.5 shadow-lg backdrop-blur duration-300 sm:bottom-5 sm:right-5"
    >
      <button
        type="button"
        onClick={() => choose(false)}
        aria-label={t("cookies.decline")}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
      <div className="flex items-start gap-2 pr-4">
        <CookieIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">{t("cookies.text")}</p>
      </div>
      {/* Two visible answers, not one button and a corner cross — declining
          should be as findable as accepting, not something you have to
          work out for yourself. */}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 text-muted-foreground hover:text-foreground"
          onClick={() => choose(false)}
        >
          {t("cookies.decline")}
        </Button>
        <Button
          size="sm"
          className="group relative flex-1 overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-primary shadow-sm shadow-primary/25 transition-all duration-200 hover:shadow-md hover:shadow-primary/35"
          onClick={() => choose(true)}
        >
          <span className="relative z-10">{t("cookies.accept")}</span>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
          />
        </Button>
      </div>
    </div>
  );
}
