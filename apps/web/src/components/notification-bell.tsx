import type { AppNotification } from "@animeshadow/shared";
import { BellIcon, CheckCheckIcon, PlayIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { imageSrc } from "@/lib/format";
import {
  episodeLine,
  notificationHref,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotifications,
  useDeleteNotifications,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d === 1 ? "вчера" : `${d} дн. назад`;
}

/** One line: poster, title, which episodes, when — unread ones marked. */
export function NotificationRow({ n, onOpen, className }: { n: AppNotification; onOpen?: () => void; className?: string }) {
  const mark = useMarkNotificationsRead();
  const remove = useDeleteNotifications();
  return (
    <div className={cn("flex min-w-0 items-center rounded-xl", !n.read && "bg-primary/[0.08]", className)}>
    <Link
      to={notificationHref(n)}
      onClick={() => {
        if (!n.read) mark.mutate({ animeId: n.anime.id });
        onOpen?.();
      }}
      className={cn(
        "group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.06]",
      )}
    >
      <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {n.anime.imageUrl && <img src={imageSrc(n.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
        <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <PlayIcon className="size-4 fill-white text-white" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{n.anime.titleLocalized || n.anime.title}</span>
        <span className={cn("text-xs", n.read ? "text-muted-foreground" : "font-semibold text-primary")}>{episodeLine(n)}</span>
        <span className="text-[10.5px] text-muted-foreground">{ago(n.createdAt)}</span>
      </span>
      {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" aria-label="Новое" />}
    </Link>
      <button type="button" aria-label={`Удалить уведомление: ${n.anime.titleLocalized || n.anime.title}`} disabled={remove.isPending}
        onClick={() => remove.mutate(n.id, { onError: () => toast.error("Не получилось удалить уведомление") })}
        className="mr-1 grid size-10 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:opacity-40 sm:size-9">
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

/**
 * The bell in the header: how many new episodes are waiting, the list a
 * click away, "read all". Once a visit, if there are new ones, a
 * notification says so on arrival.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const remove = useDeleteNotifications();
  const { data: unread = 0 } = useUnreadNotifications();
  const { data } = useNotifications(open);
  const mark = useMarkNotificationsRead();
  const greeted = useRef(false);

  // Once per visit: "new episodes are out" — straight to the list.
  useEffect(() => {
    if (greeted.current || !user || unread <= 0) return;
    greeted.current = true;
    const key = `as:notif-greeted:${user.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Fine — said again next page.
    }
    toast.info(unread === 1 ? "Вышла новая серия" : `Новых серий: ${unread}`, {
      description: "Из аниме в вашем списке",
      action: { label: "Показать", onClick: () => navigate("/library#new-episodes") },
    });
  }, [unread, user, navigate]);

  if (status !== "authenticated") return null;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Уведомления: ${unread} новых` : "Уведомления"}
          className={cn(
            "relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground",
            className,
          )}
        >
          <BellIcon className={cn("size-[18px]", unread > 0 && "text-foreground")} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3.5 py-3">
          <p className="text-sm font-semibold">Новые серии</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => mark.mutate({})}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheckIcon className="size-3.5" />
              Прочитать все
            </button>
          )}
        </div>
        <div className="max-h-[min(26rem,60dvh)] min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain p-1.5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Пока тихо</p>
              <p className="text-xs text-muted-foreground">
                Когда новая серия появится для просмотра на сайте, она появится здесь. Следим за аниме из «Смотрю», «В планах» и «Отложено».
              </p>
            </div>
          ) : (
            items.map((n) => <NotificationRow key={n.id} n={n} onOpen={() => setOpen(false)} />)
          )}
        </div>
        {items.length > 0 && <button type="button" disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onError: () => toast.error("Не получилось очистить уведомления") })}
          className="flex w-full shrink-0 items-center justify-center gap-2 border-t border-border/60 px-3 py-2.5 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-40">
          <Trash2Icon className="size-3.5" /> Очистить уведомления
        </button>}
        <div className="grid shrink-0 grid-cols-2 border-t border-border/60 text-xs font-medium text-muted-foreground">
          <Link
            to="/library#new-episodes"
            onClick={() => setOpen(false)}
            className="px-3.5 py-2.5 text-center transition-colors hover:text-foreground"
          >
            Все в «Моём списке»
          </Link>
          <Link
            to="/profile?studio=notify"
            onClick={() => setOpen(false)}
            className="border-l border-border/60 px-3.5 py-2.5 text-center transition-colors hover:text-foreground"
          >
            Telegram и push
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
