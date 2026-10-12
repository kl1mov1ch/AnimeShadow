import { type PublicProfile, type QuestKey, type QuestState, questStates } from "@animeshadow/shared";
import {
  AtSignIcon,
  BookmarkPlusIcon,
  ChevronRightIcon,
  CrownIcon,
  FlagIcon,
  GiftIcon,
  HandshakeIcon,
  HeartIcon,
  ImageIcon,
  InfinityIcon,
  LockIcon,
  type LucideIcon,
  MessageCircleIcon,
  PenLineIcon,
  PinIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
  TvIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { cn } from "@/lib/utils";
import { LevelBadge, LevelBar } from "./level-visuals";
import { RewardRoad } from "./reward-road";
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
  ];
}

type CardTab = "tasks" | "rewards" | "xp" | "ranks";

/**
 * Progression, as one card with a switch: the tasks that grow the profile
 * (one's own), the road of rewards, where the experience came from, and
 * every title of rank. Something is always open — the card is never an
 * empty header with buttons. On top: the level, its title, and the bar to
 * the next level (or, compact, a line with how much is left).
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
  /** A line instead of the badge and the bar — for a page that shows them. */
  compact?: boolean;
  className?: string;
}) {
  const info = useMemo(() => levelOf(profile), [profile]);
  const tasks = own && actions ? tasksFor(profile, actions) : [];
  const doneCount = tasks.filter((t) => t.done).length;
  const quests = useMemo(() => questStates(profile), [profile]);
  const stages = quests.reduce((sum, q) => sum + q.done, 0);
  const questXp = quests.reduce((sum, q) => sum + q.earned, 0);
  const tabs: Array<{ id: CardTab; label: string; icon: LucideIcon; badge?: string }> = [
    ...(own && actions ? [{ id: "tasks" as const, label: "Задания", icon: SparklesIcon, badge: doneCount < tasks.length ? String(tasks.length - doneCount) : undefined }] : []),
    { id: "rewards", label: "Награды", icon: GiftIcon },
    { id: "xp", label: "Опыт", icon: ZapIcon },
    { id: "ranks", label: "Звания", icon: CrownIcon },
  ];
  const [tab, setTab] = useState<CardTab>(own && actions ? "tasks" : "rewards");
  const maxXp = Math.max(1, ...info.sources.map((s) => s.xp));

  return (
    <section
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-3xl border border-[var(--accent-line-soft)] bg-[linear-gradient(180deg,var(--accent-surface),transparent_140%)] p-4 sm:p-5",
        className,
      )}
    >
      <LogoWatermark className="-right-10 -top-12 size-52 rotate-12 text-foreground/[0.04]" />
      {compact ? (
        // The level itself and its bar are in the strip above the tabs —
        // here only what this card is for.
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <SparklesIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base leading-tight sm:text-lg">Прокачка</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {stages > 0
                ? `${stages} ${plural(stages, "этап", "этапа", "этапов")} заданий пройдено · +${questXp.toLocaleString("ru-RU")} опыта`
                : own
                  ? "Выполняйте задания — за каждый этап начисляется опыт"
                  : "Награды за уровни и звания"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <span className="grid shrink-0 place-items-center p-2 pt-3">
            <LevelBadge info={info} size={72} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Уровень профиля</p>
            <p className="font-display text-xl leading-tight" style={{ color: info.tier.colors[0] }}>
              {info.tier.name}
            </p>
            <LevelBar info={info} className="mt-2" />
          </div>
        </div>
      )}

      {/* The switch. */}
      <div role="tablist" className="mt-4 grid gap-1 rounded-2xl bg-foreground/[0.05] p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(({ id, label, icon: Icon, badge }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-200",
                on ? "bg-card text-foreground shadow-sm ring-1 ring-[var(--accent-line-soft)]" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", on && "text-primary")} />
              <span className="max-w-full truncate">{label}</span>
              {badge && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div key={tab} className="mt-4 min-h-0 flex-1 animate-in duration-300 fade-in-0 slide-in-from-bottom-1">
        {tab === "tasks" && actions && (
          <div className="flex flex-col gap-4">
            {doneCount < tasks.length && (
              <div className="flex flex-col gap-2">
                <TaskHead title="Первые шаги" note={`${doneCount} из ${tasks.length}`} />
                <ul className="flex flex-col gap-1.5">
                  {tasks
                    .filter((t) => !t.done)
                    .map((task, i) => (
                      <li key={task.key} className="animate-in fade-in-0 slide-in-from-left-1" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}>
                        <button
                          type="button"
                          onClick={task.run}
                          className="group flex w-full items-center gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-background/40 px-3 py-2 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.99]"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                            <task.icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{task.title}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{task.hint}</span>
                          </span>
                          {task.xp > 0 && (
                            <span className="shrink-0 rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">+{task.xp}</span>
                          )}
                          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <QuestList profile={profile} quests={quests} actions={actions} />
          </div>
        )}
        {tab === "rewards" && <RewardRoad profile={profile} own={own} />}
        {tab === "xp" && (
          <ul className="flex flex-col gap-1.5">
            {info.sources.map((s, i) => (
              <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-xs">
                <span className="truncate text-foreground/85">
                  {s.label}
                  {s.count > 0 && s.unit && <span className="text-muted-foreground"> · {s.count.toLocaleString("ru-RU")} {s.unit}</span>}
                </span>
                <span className={cn("font-semibold tabular-nums", s.xp > 0 ? "text-foreground" : "text-muted-foreground/50")}>
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
        {tab === "ranks" && <TierLadder level={info.level} />}
      </div>
    </section>
  );
}

function TaskHead({ title, note, icon: Icon }: { title: string; note?: string; icon?: LucideIcon }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="shrink-0">{title}</span>
      {note && <span className="ml-auto min-w-0 truncate font-medium normal-case tracking-normal tabular-nums" title={note}>{note}</span>}
    </p>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** How each endless task looks, and where its button leads. */
const QUEST_LOOK: Record<QuestKey, { icon: LucideIcon; cta: string; how: string; run: (a: ProfileTaskActions) => void }> = {
  watch: { icon: TvIcon, cta: "Смотреть", how: "Засчитывается каждая досмотренная серия", run: (a) => a.go("/browse?hasCustomPlayer=1") },
  finish: { icon: FlagIcon, cta: "Мой список", how: "Тайтл засчитывается со статусом «Просмотрено»", run: (a) => a.go("/library") },
  rate: { icon: StarIcon, cta: "Оценить", how: "Оценка от 1 до 10 — в списке или на странице тайтла", run: (a) => a.go("/library") },
  collect: { icon: BookmarkPlusIcon, cta: "Каталог", how: "Подойдёт любой список: смотрю, в планах, просмотрено", run: (a) => a.go("/browse") },
  talk: { icon: MessageCircleIcon, cta: "Обсуждать", how: "Комментарии под тайтлами и сериями", run: (a) => a.go("/browse") },
  liked: { icon: HeartIcon, cta: "Обсуждать", how: "Лайки, которые ставят вашим комментариям", run: (a) => a.go("/browse") },
  friends: { icon: HandshakeIcon, cta: "Найти", how: "Друзья — это когда вы подписаны друг на друга", run: (a) => a.jump("people") },
  followers: { icon: UsersIcon, cta: "Люди", how: "Подписывайтесь на других — многие отвечают тем же", run: (a) => a.jump("people") },
  trophies: { icon: TrophyIcon, cta: "Трофеи", how: "У каждого достижения есть подсказка, как его получить", run: (a) => a.jump("trophies") },
};

const QUESTS_SHOWN = 4;

/**
 * The endless tasks: each on its current stage, with how far along it is,
 * what the stage pays and a button straight to where it's done. The closest
 * to done come first. A stage passed since the last visit is announced.
 */
function QuestList({ profile, quests, actions }: { profile: PublicProfile; quests: QuestState[]; actions: ProfileTaskActions }) {
  const [all, setAll] = useState(false);
  const ratio = (q: QuestState) => (q.target == null ? -1 : (q.value - q.from) / Math.max(1, q.target - q.from));
  const sorted = [...quests].sort((x, y) => ratio(y) - ratio(x));
  const shown = all ? sorted : sorted.slice(0, QUESTS_SHOWN);
  const signature = quests.map((q) => q.done).join(",");

  useEffect(() => {
    const key = `animeshadow:quests:${profile.id}`;
    let before: Record<string, number> | null = null;
    try {
      before = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, number> | null;
    } catch {
      before = null;
    }
    if (before) {
      quests
        .filter((q) => q.done > (before[q.def.key] ?? 0))
        .slice(0, 3)
        .forEach((q) =>
          toast.success(`«${q.def.title}»: этап ${q.done} пройден`, {
            description: q.target != null ? `Открыт следующий: ${q.def.goal(q.target).toLowerCase()}` : "Все этапы пройдены!",
          }),
        );
    }
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(quests.map((q) => [q.def.key, q.done]))));
    } catch {
      // Private mode: nothing to compare with next time, which is fine.
    }
    // The signature stands for the stages; quests itself is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, signature]);

  return (
    <div className="flex flex-col gap-2">
      <TaskHead title="Задания без конца" icon={InfinityIcon} note="за этапом — следующий" />
      <ul className="flex flex-col gap-1.5">
        {shown.map((q, i) => {
          const look = QUEST_LOOK[q.def.key];
          const finished = q.target == null;
          const pct = finished ? 100 : Math.min(100, Math.max(0, ((q.value - q.from) / Math.max(1, q.target! - q.from)) * 100));
          return (
            <li key={q.def.key} className="animate-in fade-in-0 slide-in-from-left-1" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}>
              <button
                type="button"
                onClick={() => look.run(actions)}
                title={look.how}
                className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-[var(--accent-line-soft)] bg-background/40 px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.06] active:scale-[0.99]"
              >
                <span className="relative grid size-9 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <look.icon className="size-4" />
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-card px-1 text-[9px] font-bold leading-[14px] tabular-nums text-foreground ring-1 ring-[var(--accent-line-soft)]">
                    {finished ? "✓" : q.done + 1}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-sm font-semibold">{q.def.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{finished ? "все этапы" : `этап ${q.done + 1}`}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{finished ? "Все этапы пройдены" : q.def.goal(q.target!)}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                      <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-16 shrink-0 truncate text-right text-[10px] tabular-nums text-muted-foreground">
                      {q.value.toLocaleString("ru-RU")}
                      {!finished && ` / ${q.target!.toLocaleString("ru-RU")}`}
                    </span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  {!finished && (
                    <span className="rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">+{q.reward}</span>
                  )}
                  <span className="inline-flex items-center text-[11px] font-medium text-foreground/80 transition-colors group-hover:text-primary">
                    <span className="hidden sm:inline">{look.cta}</span>
                    <ChevronRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {sorted.length > QUESTS_SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="w-full rounded-xl border border-dashed border-[var(--accent-line-soft)] py-2 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/[0.05] hover:text-primary"
        >
          {all ? "Свернуть" : `Показать все задания · ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * Every band, from the first to the last, as its own medallion at its first
 * level: those reached in colour, the current one lit, the rest dimmed with
 * the level they open at.
 */
function TierLadder({ level }: { level: number }) {
  return (
    <ol className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6 lg:grid-cols-4">
      {LEVEL_TIERS.map((tier) => {
        const reached = level >= tier.from;
        const current = reached && !LEVEL_TIERS.some((t) => t.from > tier.from && level >= t.from);
        const preview = { level: tier.from, xp: xpForLevel(tier.from), floor: 0, ceiling: 1, progress: reached ? 1 : 0, tier, nextTier: null, sources: [] };
        return (
          <li
            key={tier.from}
            title={reached ? tier.name : `${tier.name} — с ${tier.from} уровня`}
            className={cn("relative flex flex-col items-center gap-2.5 rounded-2xl px-1 pb-2 pt-4 text-center", current && "bg-[var(--accent-surface-strong)] ring-1 ring-primary/40")}
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

