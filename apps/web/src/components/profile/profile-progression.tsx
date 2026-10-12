import type { PublicProfile } from "@animeshadow/shared";
import {
  CheckIcon,
  ChevronDownIcon,
  CrownIcon,
  LockIcon,
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
import { LevelBadge, LevelBar } from "./level-visuals";
import { LEVEL_TIERS, levelOf, xpForLevel } from "./profile-level";

/* ------------------------------------------------------------------------ */
/* The level card: progress, where experience comes from, the owner's tasks  */
/* ------------------------------------------------------------------------ */

export interface ProfileTaskActions {
  pickAvatar: () => void;
  pickBanner: () => void;
  /** Opens the profile studio on a section. */
  openStudio: (tab: "profile" | "look" | "showcase") => void;
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
    { key: "bio", icon: PenLineIcon, title: "Расскажите о себе", hint: "Пара строк под именем", xp: 20, done: Boolean(profile.bio), run: () => a.openStudio("profile") },
    { key: "username", icon: AtSignIcon, title: "Займите никнейм", hint: "Ссылка на профиль: /profile/ник", xp: 0, done: Boolean(profile.username), run: () => a.openStudio("profile") },
    { key: "favorites", icon: HeartIcon, title: "Соберите «Мою пятёрку»", hint: `${profile.favorites.length} из 5 — любимые тайтлы в начале профиля`, xp: 75, done: profile.favorites.length >= 5, run: () => a.jump("showcase") },
    { key: "pins", icon: PinIcon, title: "Выставьте достижения на витрину", hint: "Они встанут под именем", xp: 30, done: profile.showcaseAchievementIds.length >= 3, run: () => a.openStudio("showcase") },
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
  const [ladder, setLadder] = useState(false);
  const [allTasks, setAllTasks] = useState(false);
  const toNext = info.ceiling - info.xp;
  const nextTier = info.nextTier;
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
        <LevelBadge info={info} size={72} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Уровень профиля</p>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-xl leading-tight" style={{ color: info.tier.colors[0] }}>{info.tier.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{info.xp.toLocaleString("ru-RU")} опыта</span>
          </p>
          <LevelBar info={info} labels={false} className="mt-2" />
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

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "flex items-center justify-between gap-1 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors",
            open ? "border-primary/40 bg-primary/10 text-foreground" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <ZapIcon className="size-3.5 text-primary" />
            Откуда опыт
          </span>
          <ChevronDownIcon className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={() => setLadder((v) => !v)}
          aria-expanded={ladder}
          className={cn(
            "flex items-center justify-between gap-1 rounded-xl border px-2.5 py-2 text-xs font-medium transition-colors",
            ladder ? "border-primary/40 bg-primary/10 text-foreground" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <CrownIcon className="size-3.5 text-amber-400" />
            Все звания
          </span>
          <ChevronDownIcon className={cn("size-4 transition-transform duration-300", ladder && "rotate-180")} />
        </button>
      </div>
      {ladder && <TierLadder level={info.level} />}
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
            {/* What is left, four at a time — the next thing to do on top. */}
            {(allTasks ? [...tasks].sort((a, b) => Number(a.done) - Number(b.done)) : tasks.filter((t) => !t.done).slice(0, 4)).map((task, i) => (
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
          {(tasks.length - doneCount > 4 || doneCount > 0) && (
            <button
              type="button"
              onClick={() => setAllTasks((v) => !v)}
              className="mt-2 w-full rounded-xl py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              {allTasks ? "Свернуть" : `Все задания · ${doneCount} из ${tasks.length} выполнено`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Every band, from the first to the last, as its own medallion at its first
 * level: those reached in colour, the current one lit, the rest dimmed with
 * the level they open at.
 */
function TierLadder({ level }: { level: number }) {
  return (
    <ol className="mt-3 grid animate-in grid-cols-4 gap-x-2 gap-y-3 duration-300 fade-in-0 slide-in-from-top-1 sm:grid-cols-6 lg:grid-cols-4">
      {LEVEL_TIERS.map((tier) => {
        const reached = level >= tier.from;
        const current = reached && !LEVEL_TIERS.some((t) => t.from > tier.from && level >= t.from);
        const preview = { level: tier.from, xp: xpForLevel(tier.from), floor: 0, ceiling: 1, progress: reached ? 1 : 0, tier, nextTier: null, sources: [] };
        return (
          <li
            key={tier.from}
            title={reached ? tier.name : `${tier.name} — с ${tier.from} уровня`}
            className={cn(
              "relative flex flex-col items-center gap-2.5 rounded-2xl px-1 pb-2 pt-4 text-center",
              current ? "bg-[var(--accent-surface-strong)] ring-1 ring-primary/40" : "",
            )}
          >
            <span className={cn("transition-[filter,opacity]", !reached && "opacity-35 grayscale")}>
              <LevelBadge info={preview} size={40} animated={current} />
            </span>
            <span className="relative z-10 line-clamp-2 text-[10px] font-medium leading-tight" style={reached ? { color: tier.colors[0] } : undefined}>
              {tier.name}
            </span>
            {!reached && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground">
                <LockIcon className="size-2.5" />
                {tier.from} ур.
              </span>
            )}
          </li>
        );
      })}
    </ol>
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

