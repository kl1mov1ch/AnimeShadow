import {
  BookmarkIcon,
  FolderHeartIcon,
  HistoryIcon,
  TrophyIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { useAuth } from "@/hooks/use-auth";
import { AccountPreview } from "./account-preview";
import { cn } from "@/lib/utils";

/** What an account gives — the same list on the invite and the sign-up page. */
export const ACCOUNT_PERKS = [
  {
    icon: HistoryIcon,
    text: "Серии отмечаются сами — продолжишь с той же минуты на любом устройстве",
  },
  { icon: BookmarkIcon, text: "Свой список: смотрю, в планах, просмотрено — и оценки" },
  { icon: FolderHeartIcon, text: "Свои подборки, лайки и избранное" },
  { icon: TrophyIcon, text: "Уровни, достижения, приписки и свой профиль" },
] as const;

type Variant = "home" | "browse" | "collections";

const COPY: Record<Variant, { gif: string; title: string; text: string }> = {
  home: {
    gif: "wave",
    title: "Твой следующий аниме-вечер — с того же места",
    text: "Ты уже здесь — осталось 20 секунд, и AnimeShadow станет твоим: главная подстроится под вкус, серии будут отмечаться сами, а всё, что нашёл, никуда не денется. Бесплатно и навсегда.",
  },
  browse: {
    gif: "pout",
    title: "Сохрани аниме на потом",
    text: "Добавляй находки в свой список и возвращайся к ним с любого устройства.",
  },
  collections: {
    gif: "blush",
    title: "Собери свою подборку?",
    text: "Свои подборки, лайки и избранное — бесплатно, за 20 секунд.",
  },
};

/** At most once in this long, and only when moving to another page. */
const EVERY_MS = 5 * 60_000;
const LAST_KEY = "animeshadow:guest-nudge:last";

function variantOf(path: string): Variant | null {
  if (path === "/") return "home";
  if (
    path.startsWith("/browse") ||
    path.startsWith("/ongoing") ||
    path.startsWith("/top")
  )
    return "browse";
  if (path.startsWith("/collections")) return "collections";
  // A title's page has its own strip above the player instead.
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
 * (home, catalog, collections) — or after a while on the home page — and at
 * most once every five minutes. A title's page never shows it: the strip
 * above the player speaks there. On the home page it is the big one, with
 * everything an account gives.
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
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const accountPage =
      /^\/(login|register|verify-email|forgot-password|reset-password)(\/|$)/.test(
        pathname,
      );
    const v = accountPage ? null : (variantOf(pathname) ?? (mobile ? "home" : null));
    const due = last == null || now - last >= EVERY_MS;
    let wait = 1200;
    if (!landed.current) {
      // Landing: only the home page asks, after a while on it; elsewhere
      // the clock just starts on the very first visit.
      landed.current = true;
      if (!v || !due || (!mobile && v !== "home")) {
        if (last == null) {
          memLast.current = now;
          writeLast(now);
        }
        return;
      }
      wait = mobile ? 300 : 15_000;
    } else {
      // A move to another page hides the one still open.
      setVariant(null);
      if (!v || !due) return;
    }
    // A beat after the page arrives, not on top of the transition.
    const id = window.setTimeout(() => {
      // A reader already scrolling through results should keep their place.
      if (
        (!mobile && window.scrollY > window.innerHeight * 0.6) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      memLast.current = Date.now();
      writeLast(memLast.current);
      setVariant(v);
    }, wait);
    return () => window.clearTimeout(id);
  }, [guest, pathname]);

  if (!guest || !variant) return null;
  const copy = COPY[variant];
  const close = () => setVariant(null);
  return (
    <aside
      aria-label="Возможности аккаунта"
      data-guest-nudge
      className="guest-nudge fixed inset-x-3 bottom-[calc(var(--mobile-nav-space)+0.75rem)] z-40 mx-auto max-h-[65dvh] max-w-sm overflow-y-auto rounded-2xl border border-primary/25 bg-card p-4 shadow-xl shadow-black/30 motion-safe:animate-in motion-safe:slide-in-from-bottom-2 md:inset-x-auto md:left-5 md:mx-0"
    >
      <button
        type="button"
        onClick={close}
        aria-label="Закрыть приглашение"
        className="absolute right-1 top-1 grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
      >
        <XIcon className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <LogoGlyph className="size-7" />
        </span>
        <p className="text-sm font-semibold leading-snug">{copy.title}</p>
      </div>
      <ul className="my-3 grid gap-1.5 text-xs leading-snug text-muted-foreground">
        <li>Продолжение с сохранённой серии и минуты</li>
        <li>Свои списки, оценки и подборки</li>
        <li>Уведомления о новых доступных сериях</li>
      </ul>
      <details className="my-3">
        <summary className="cursor-pointer text-xs text-primary">
          Попробовать возможности
        </summary>
        <div className="mt-2 max-h-[45dvh] overflow-y-auto">
          <AccountPreview compact />
        </div>
      </details>
      <div className="flex gap-2">
        <Link
          to="/register"
          state={{ from: pathname }}
          onClick={close}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/85"
        >
          Создать аккаунт
        </Link>
        <Link
          to="/login"
          state={{ from: pathname }}
          onClick={close}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm hover:bg-secondary"
        >
          Войти
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Регистрация бесплатна</p>
    </aside>
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
