import { BookmarkIcon, FolderHeartIcon, HistoryIcon, SparklesIcon, TrophyIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ReactionGif } from "@/components/common/reaction-gif";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/** What an account gives — the same list on the invite and the sign-up page. */
export const ACCOUNT_PERKS = [
  { icon: HistoryIcon, text: "Серии отмечаются сами — продолжишь с той же минуты на любом устройстве" },
  { icon: BookmarkIcon, text: "Свой список: смотрю, в планах, просмотрено — и оценки" },
  { icon: FolderHeartIcon, text: "Свои подборки, лайки и избранное" },
  { icon: TrophyIcon, text: "Уровни, достижения, рамки и профиль, который хочется показать" },
] as const;

type Variant = "home" | "browse" | "collections" | "anime";

const COPY: Record<Variant, { gif: string; title: string; text: string }> = {
  home: {
    gif: "wave",
    title: "Эй, останешься с нами?",
    text: "С аккаунтом главная подстроится под тебя, а прогресс серий не потеряется.",
  },
  browse: {
    gif: "pout",
    title: "Находки же пропадут!",
    text: "Сохрани их в «В планах» — без аккаунта всё исчезнет с закрытой вкладкой.",
  },
  collections: {
    gif: "blush",
    title: "Собери свою подборку?",
    text: "Свои подборки, лайки и избранное — бесплатно, за 20 секунд.",
  },
  anime: {
    gif: "smile",
    title: "Запомнить, где ты?",
    text: "Отмечай серии, ставь оценки и считай марафоны — нужен только аккаунт.",
  },
};

/** At most once in this long, and only when moving to another page. */
const EVERY_MS = 5 * 60_000;
const LAST_KEY = "animeshadow:guest-nudge:last";

function variantOf(path: string): Variant | null {
  if (path === "/") return "home";
  if (path.startsWith("/browse") || path.startsWith("/ongoing") || path.startsWith("/top")) return "browse";
  if (path.startsWith("/collections")) return "collections";
  if (path.startsWith("/anime/")) return "anime";
  return null;
}

function readLast(): number | null {
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeLast(at: number) {
  try {
    localStorage.setItem(LAST_KEY, String(at));
  } catch {
    // No storage: the clock lives in memory for this visit.
  }
}

/**
 * A small, friendly invite for guests — bottom-left on a computer, a compact
 * card in the middle of a phone's screen (a quarter of it at most). It never
 * interrupts watching: it only appears when the guest moves to another page
 * (home, catalog, collections, a title), and at most once every five
 * minutes; staying on one page, player running, never brings it up.
 */
export function GuestNudge() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [variant, setVariant] = useState<Variant | null>(null);
  const guest = status === "anonymous";
  const memLast = useRef<number | null>(null);
  const landed = useRef(false);

  useEffect(() => {
    if (!guest) return;
    const now = Date.now();
    const last = readLast() ?? memLast.current;
    // Nothing on landing; the clock starts on the very first visit.
    if (!landed.current) {
      landed.current = true;
      if (last == null) {
        memLast.current = now;
        writeLast(now);
      }
      return;
    }
    // A move to another page hides the one still open.
    setVariant(null);
    const v = variantOf(pathname);
    if (!v || (last != null && now - last < EVERY_MS)) return;
    // A beat after the page arrives, not on top of the transition.
    const id = window.setTimeout(() => {
      memLast.current = Date.now();
      writeLast(memLast.current);
      setVariant(v);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [guest, pathname]);

  if (!guest || !variant) return null;
  const copy = COPY[variant];
  const close = () => setVariant(null);

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className={cn(
        "fixed z-50 animate-in duration-500 fade-in-0",
        // Phone: a compact card in the middle. Computer: the bottom-left corner.
        "inset-x-0 top-1/2 mx-auto w-[min(22rem,calc(100vw-2rem))] -translate-y-1/2 zoom-in-90",
        "md:inset-x-auto md:bottom-5 md:left-5 md:top-auto md:mx-0 md:w-[21rem] md:translate-y-0 md:zoom-in-100 md:slide-in-from-left-8",
      )}
    >
      <div className="nudge-ring rounded-3xl p-px shadow-[0_24px_60px_-18px_rgb(0_0_0/0.85)]">
        <div className="relative max-h-[25dvh] overflow-hidden rounded-[calc(1.5rem-1px)] bg-[color-mix(in_srgb,var(--card)_95%,white_5%)] p-3.5 md:max-h-none">
          <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 size-36 rounded-full bg-primary/25 blur-3xl" />
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
          <div className="relative flex items-center gap-3">
            <div className="relative shrink-0">
              <ReactionGif category={copy.gif} className="nudge-bob size-14 rounded-xl shadow-lg md:size-16" />
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className="nudge-heart text-xs text-primary"
                  style={{ left: `${20 + i * 22}%`, animationDelay: `${i * 0.9}s` }}
                >
                  ♥
                </span>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 pr-5">
              <p className="font-display text-[15px] leading-tight">{copy.title}</p>
              <p className="line-clamp-2 text-[12px] leading-snug text-foreground/75">{copy.text}</p>
            </div>
          </div>
          <div className="relative mt-3 flex items-center gap-2">
            <Link
              to="/register"
              onClick={close}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-3 text-[13px] font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
            >
              <SparklesIcon className="size-3.5" />
              Создать аккаунт
            </Link>
            <Link
              to="/login"
              onClick={close}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-border/70 px-3 text-[13px] font-semibold transition-colors hover:border-foreground/30"
            >
              Войти
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A compact line of the perks, ticked — for the sign-up page and the menu. */
export function PerksList({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {ACCOUNT_PERKS.map(({ icon: Icon, text }, i) => (
        <li
          key={text}
          className="flex animate-in items-start gap-3 text-sm text-foreground/85 duration-500 fade-in-0 slide-in-from-left-2"
          style={{ animationDelay: `${i * 90}ms`, animationFillMode: "backwards" }}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4" />
          </span>
          <span className="pt-1">{text}</span>
        </li>
      ))}
    </ul>
  );
}
