import type { PublicProfile } from "@animeshadow/shared";
import {
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  type LucideIcon,
  PenLineIcon,
  PinIcon,
  SparklesIcon,
  StarIcon,
  TvIcon,
  UserRoundIcon,
  AtSignIcon,
  HeartIcon,
  ZapIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { cn } from "@/lib/utils";
import { LEVEL_TIERS, type LevelInfo, levelOf } from "./profile-level";

/* ------------------------------------------------------------------------ */
/* The level badge                                                           */
/* ------------------------------------------------------------------------ */

/**
 * The level as a medallion: the number inside, a ring that fills toward the
 * next level, in the colours of the level's band.
 */
export function LevelBadge({ info, size = 56, className }: { info: LevelInfo; size?: number; className?: string }) {
  const stroke = Math.max(3, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const id = `lvl-${info.tier.from}-${size}`;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={info.tier.from_color} />
            <stop offset="100%" stopColor={info.tier.to_color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-foreground/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - info.progress)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span
        className="grid place-items-center rounded-full font-display leading-none text-white shadow-inner"
        style={{
          width: size - stroke * 2 - 6,
          height: size - stroke * 2 - 6,
          fontSize: Math.round(size * 0.34),
          background: `linear-gradient(135deg, ${info.tier.from_color}, ${info.tier.to_color})`,
        }}
      >
        {info.level}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* The level card: progress, where experience comes from, the owner's tasks  */
/* ------------------------------------------------------------------------ */

export interface ProfileTaskActions {
  pickAvatar: () => void;
  pickBanner: () => void;
  /** Opens the profile studio on a section. */
  openStudio: (tab: "look" | "account") => void;
  /** Scrolls to a block of the page. */
  jump: (id: string) => void;
  go: (to: string) => void;
}

interface Task {
  key: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  xp: number;
  done: boolean;
  run: () => void;
}

function tasksFor(profile: PublicProfile, a: ProfileTaskActions): Task[] {
  return [
    { key: "avatar", icon: UserRoundIcon, title: "Поставьте аватар", hint: "Своя картинка или случайная", xp: 30, done: Boolean(profile.avatarUrl), run: a.pickAvatar },
    { key: "banner", icon: ImageIcon, title: "Добавьте обложку", hint: "Широкая картинка за шапкой, GIF тоже можно", xp: 30, done: Boolean(profile.bannerUrl), run: a.pickBanner },
    { key: "bio", icon: PenLineIcon, title: "Расскажите о себе", hint: "Пара строк под именем", xp: 20, done: Boolean(profile.bio), run: () => a.openStudio("account") },
    { key: "username", icon: AtSignIcon, title: "Займите никнейм", hint: "Ссылка на профиль: /profile/ник", xp: 0, done: Boolean(profile.username), run: () => a.openStudio("account") },
    { key: "favorites", icon: HeartIcon, title: "Соберите «Мою пятёрку»", hint: `${profile.favorites.length} из 5 — любимые тайтлы в начале профиля`, xp: 75, done: profile.favorites.length >= 5, run: () => a.jump("showcase") },
    { key: "pins", icon: PinIcon, title: "Выставьте достижения на витрину", hint: "Они встанут под именем", xp: 30, done: profile.showcaseAchievementIds.length >= 3, run: () => a.jump("trophies") },
    { key: "watch", icon: TvIcon, title: "Посмотрите 10 серий", hint: `${Math.min(10, profile.stats.episodesWatched)} из 10`, xp: 100, done: profile.stats.episodesWatched >= 10, run: () => a.go("/browse?hasCustomPlayer=1") },
    { key: "rate", icon: StarIcon, title: "Оцените три тайтла", hint: "Оценки делают рекомендации точнее", xp: 0, done: profile.stats.topRated.length >= 3, run: () => a.go("/library") },
  ];
}

/**
 * The level, in one card: the badge and its band, the bar to the next
 * level, and — open on a tap — where the experience came from. On the
 * owner's own profile, under it, the tasks that grow the profile, each one
 * a button that goes straight to where it is done.
 */
export function LevelCard({
  profile,
  own,
  actions,
  compact = false,
  className,
}: {
  profile: PublicProfile;
  own: boolean;
  actions?: ProfileTaskActions;
  /** Without the badge and the bar — for a page that already shows them. */
  compact?: boolean;
  className?: string;
}) {
  const info = useMemo(() => levelOf(profile), [profile]);
  const [open, setOpen] = useState(false);
  const toNext = info.ceiling - info.xp;
  const nextTier = LEVEL_TIERS.find((tier) => tier.from > info.level);
  const tasks = own && actions ? tasksFor(profile, actions) : [];
  const doneCount = tasks.filter((t) => t.done).length;
  const maxXp = Math.max(1, ...info.sources.map((s) => s.xp));

  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5",
        className,
      )}
    >
      <LogoWatermark className="-right-10 -top-12 size-52 rotate-12 text-foreground/[0.04]" />
      {compact && (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent-surface-strong)] text-[var(--accent-ink)] ring-1 ring-[var(--accent-line-soft)]">
            <ZapIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base leading-tight sm:text-lg">Прокачка</p>
            <p className="text-[11px] text-muted-foreground">
              {info.xp.toLocaleString("ru-RU")} опыта · до {info.level + 1} ур. ещё{" "}
              <span className="font-semibold tabular-nums text-foreground/85">{toNext.toLocaleString("ru-RU")}</span>
            </p>
          </div>
        </div>
      )}
      <div className={cn("flex items-center gap-4", compact && "hidden")}>
        <LevelBadge info={info} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Уровень профиля</p>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-xl leading-tight">{info.tier.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{info.xp.toLocaleString("ru-RU")} опыта</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out"
              style={{
                width: `${Math.max(3, info.progress * 100)}%`,
                background: `linear-gradient(90deg, ${info.tier.from_color}, ${info.tier.to_color})`,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            До {info.level + 1} уровня — <span className="font-semibold tabular-nums text-foreground/85">{toNext.toLocaleString("ru-RU")}</span> опыта
            {nextTier && (
              <>
                {" · "}звание «{nextTier.name}» с {nextTier.from} ур.
              </>
            )}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <ZapIcon className="size-3.5 text-primary" />
          Откуда опыт
        </span>
        <ChevronDownIcon className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-1 flex animate-in flex-col gap-1.5 duration-300 fade-in-0 slide-in-from-top-1">
          {info.sources.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-xs">
              <span className="truncate text-foreground/85">
                {s.label}
                {s.count > 0 && s.unit && (
                  <span className="text-muted-foreground"> · {s.count.toLocaleString("ru-RU")} {s.unit}</span>
                )}
              </span>
              <span className={cn("tabular-nums font-semibold", s.xp > 0 ? "text-foreground" : "text-muted-foreground/50")}>
                {s.xp > 0 ? `+${s.xp.toLocaleString("ru-RU")}` : `+${s.each} за ${s.unit ? "каждый" : "это"}`}
              </span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <span
                  className="block h-full origin-left rounded-full bg-primary/70 transition-transform duration-700 ease-out"
                  style={{ transform: `scaleX(${s.xp / maxXp})`, transitionDelay: `${i * 40}ms` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && doneCount < tasks.length && (
        <div className="mt-4 border-t border-[var(--accent-line-soft)] pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <SparklesIcon className="size-4 text-primary" />
              Прокачайте профиль
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {doneCount} из {tasks.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {/* What is left first: the next thing to do is on top. */}
            {[...tasks].sort((a, b) => Number(a.done) - Number(b.done)).map((task, i) => (
              <li key={task.key} style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  disabled={task.done}
                  onClick={task.run}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[border-color,background-color,transform] duration-200",
                    task.done
                      ? "border-transparent bg-transparent opacity-55"
                      : "border-border/60 bg-card/50 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.99]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                      task.done ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/10 text-primary group-hover:bg-primary/20",
                    )}
                  >
                    {task.done ? <CheckIcon className="size-4" /> : <task.icon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", task.done && "line-through decoration-foreground/30")}>
                      {task.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{task.hint}</span>
                  </span>
                  {task.xp > 0 && !task.done && (
                    <span className="shrink-0 rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                      +{task.xp}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Numbers that count up                                                     */
/* ------------------------------------------------------------------------ */

/** A number that counts up from zero the first time it comes into view. */
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof IntersectionObserver === "undefined") {
      setShown(value);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(value * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

