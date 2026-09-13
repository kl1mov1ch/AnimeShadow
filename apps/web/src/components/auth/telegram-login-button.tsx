import { useEffect, useRef } from "react";
import {
  isTelegramWidgetSupported,
  TELEGRAM_BOT_USERNAME,
  type TelegramAuthData,
} from "@/lib/telegram-auth";

/**
 * Telegram's own widget script replaces this container's contents with a
 * real `<iframe>` button once it loads — there's no JS API to render it any
 * other way, so the script tag itself (with the right data-* attributes) has
 * to be injected directly. `onAuth` is bridged through a global function
 * because that's the only thing `data-onauth="..."` can call.
 *
 * Renders nothing at all when `isTelegramWidgetSupported()` says this host
 * can't work — callers should check the same function before deciding
 * whether to show a divider/heading around this at all (see login.tsx).
 */
export function TelegramLoginButton({
  onAuth,
}: {
  onAuth: (data: TelegramAuthData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    if (!isTelegramWidgetSupported()) return;
    const container = containerRef.current;
    if (!container) return;

    window.onTelegramAuth = (data) => onAuthRef.current(data);

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", TELEGRAM_BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
      delete window.onTelegramAuth;
    };
  }, []);

  if (!isTelegramWidgetSupported()) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
