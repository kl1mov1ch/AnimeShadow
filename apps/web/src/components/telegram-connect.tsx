import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNotifyActions, useNotifySettings } from "@/lib/push";

export function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M21.05 3.35 2.87 10.44c-1.24.5-1.23 1.2-.23 1.5l4.66 1.46 1.8 5.5c.22.6.42.85.85.85.44 0 .63-.2.87-.45l2.1-2.05 4.37 3.23c.8.45 1.38.22 1.58-.75L21.9 4.63c.28-1.18-.44-1.72-1.35-1.28Z"
        fill="currentColor"
      />
    </svg>
  );
}

export type TelegramState = "unavailable" | "none" | "blocked" | "connected" | "off";

/**
 * Ties the account to a Telegram chat: opens the bot with a one-time code
 * (t.me/<bot>?start=…), then watches for the Start press and says when it
 * landed. Used by the account menu, the phone menu and the notification
 * settings alike.
 */
export function useTelegramConnect() {
  const { data, refetch } = useNotifySettings();
  const { link } = useNotifyActions();
  const [waiting, setWaiting] = useState(false);

  const tg = data?.telegram;
  const state: TelegramState = !tg?.available
    ? "unavailable"
    : !tg.connected
      ? "none"
      : tg.blocked
        ? "blocked"
        : tg.enabled
          ? "connected"
          : "off";

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      void refetch().then((r) => {
        if (r.data?.telegram.connected && !r.data.telegram.blocked) {
          setWaiting(false);
          toast.success("Telegram подключён", { description: "Новые серии будут приходить от бота" });
        }
      });
      if (Date.now() - started > 3 * 60_000) setWaiting(false);
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, refetch]);

  const connect = () => {
    // The tab opens on the click itself (pop-up blockers allow only that),
    // and is pointed at the bot once the link arrives.
    const tab = window.open("about:blank", "_blank");
    link.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (tab) tab.location.href = url;
        else window.location.href = url;
        setWaiting(true);
        toast("Нажмите «Start» в боте", { description: "Мы сами увидим, когда чат подключится" });
      },
      onError: (error) => {
        tab?.close();
        toast.error("Не получилось подключить Telegram", { description: error.message });
      },
    });
  };

  return { state, bot: tg?.bot ?? null, connect, waiting, pending: link.isPending };
}
