import { CookieIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

const STORAGE_KEY = "animeshadow.cookie-consent.v1";

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

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="animate-in slide-in-from-bottom-4 fade-in fixed bottom-3 right-3 z-50 w-[min(15.5rem,calc(100vw-1.5rem))] rounded-xl border border-border/60 bg-card/95 p-3.5 shadow-lg backdrop-blur duration-300 sm:bottom-5 sm:right-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.cancel")}
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <XIcon className="size-3.5" />
      </button>
      <div className="flex items-start gap-2 pr-4">
        <CookieIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted-foreground">{t("cookies.text")}</p>
      </div>
      <Button size="sm" className="mt-3 w-full" onClick={dismiss}>
        {t("cookies.accept")}
      </Button>
    </div>
  );
}
