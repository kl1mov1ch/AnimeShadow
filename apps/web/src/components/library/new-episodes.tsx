import { BellRingIcon, CheckCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { NotificationRow } from "@/components/notification-bell";
import { useMarkNotificationsRead, useNotifications } from "@/lib/notifications";

/**
 * At the top of "My list": new episodes of what's in it, unread ones first
 * and marked. Opened from the bell's "all" link (#new-episodes), it scrolls
 * itself into view. Nothing new and nothing recent: not shown at all.
 */
export function NewEpisodesBlock() {
  const { data } = useNotifications(true);
  const mark = useMarkNotificationsRead();
  const ref = useRef<HTMLElement>(null);
  const items = (data?.items ?? []).slice(0, 12);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (items.length > 0 && window.location.hash === "#new-episodes") ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) return null;
  return (
    <section
      id="new-episodes"
      ref={ref}
      className="col-span-full flex scroll-mt-24 flex-col gap-3 rounded-2xl border border-primary/30 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_60%)] p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 whitespace-nowrap font-display text-base sm:text-lg">
          <BellRingIcon className="size-5 text-primary" />
          Новые серии
          {unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{unread}</span>}
        </h2>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => mark.mutate({})}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <CheckCheckIcon className="size-3.5" />
            <span className="sm:hidden">Прочитать все</span>
            <span className="hidden sm:inline">Отметить все прочитанными</span>
          </button>
        )}
      </header>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((n) => (
          <NotificationRow key={n.id} n={n} className="border border-border/40" />
        ))}
      </div>
    </section>
  );
}
