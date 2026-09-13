import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import {
  buildTelegramAuthUrl,
  consumeTelegramAuthResult,
  isTelegramLoginSupported,
  type TelegramAuthData,
} from "@/lib/telegram-auth";

/** Telegram's own paper-plane mark, drawn with `currentColor` so it always
 * matches the button's text color instead of Telegram's brand blue. */
function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
      <path
        d="M21.05 3.35 2.87 10.44c-1.24.5-1.23 1.2-.23 1.5l4.66 1.46 1.8 5.5c.22.6.42.85.85.85.44 0 .63-.2.87-.45l2.1-2.05 4.37 3.23c.8.45 1.38.22 1.58-.75L21.9 4.63c.28-1.18-.44-1.72-1.35-1.28Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * A site-styled button that hands off to Telegram's OAuth redirect endpoint
 * (see lib/telegram-auth.ts) instead of embedding their iframe widget — the
 * widget is a cross-origin blue button with no styling hooks, which is why
 * this exists at all.
 *
 * The same component both starts the flow (on click) and finishes it: on
 * mount it checks whether the URL already carries a `tgAuthResult` from a
 * just-completed redirect and, if so, hands it to `onAuth` once.
 */
export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (data: TelegramAuthData) => void;
}) {
  const t = useT();
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const result = consumeTelegramAuthResult();
    if (result) onAuthRef.current(result);
  }, []);

  if (!isTelegramLoginSupported()) return null;

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full gap-2 shadow-none text-foreground/90 hover:text-foreground"
      onClick={() => {
        window.location.href = buildTelegramAuthUrl();
      }}
    >
      <TelegramGlyph />
      {t("auth.telegramCta")}
    </Button>
  );
}
