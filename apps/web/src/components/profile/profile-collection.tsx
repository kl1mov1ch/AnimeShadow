import type { AchievementRarity, EarnedAchievement, PublicProfile } from "@animeshadow/shared";
import { MAX_SHOWCASE_ACHIEVEMENTS } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  DnaIcon,
  HeartHandshakeIcon,
  PinIcon,
  PinOffIcon,
  TargetIcon,
  TrophyIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useGenres, useMyProfile, useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * The two blocks right under a profile's numbers: its trophies and its
 * taste. They used to sit in a narrow side column that stuck to the screen
 * and slid along beside everything else on the page; now they are two
 * full blocks of their own, and each one does something.
 */

function Block({
  icon: Icon,
  title,
  aside,
  children,
  className,
}: {
  icon: typeof TrophyIcon;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 font-display text-lg tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Icon className="size-4" />
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Trophy hall                                                                */
/* -------------------------------------------------------------------------- */

const RARITIES: AchievementRarity[] = ["legendary", "epic", "rare", "common"];
const RARITY_CHIP: Record<AchievementRarity, string> = {
  common: "border-orange-700/40 bg-orange-700/10 text-orange-600 dark:text-orange-400",
  rare: "border-sky-500/40 bg-sky-500/10 text-sky-500",
  epic: "border-violet-500/40 bg-violet-500/10 text-violet-500",
  legendary: "border-amber-400/50 bg-amber-400/10 text-amber-500",
};

type HallTab = "showcase" | "next" | "all";

/**
 * Achievements as a trophy hall: how many of each rarity, then three views
 * — the showcase (what's been won, pinned first), what's next (the closest
 * ones, with how much is left) and everything. On one's own profile a
 * medallion is pinned to the name — the three shown next to it in comments
 * — straight from here.
 */
export function TrophyHall({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const update = useUpdateProfile();
  const [tab, setTab] = useState<HallTab>("showcase");
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);

  const all = profile.achievements;
  const earned = all
    .filter((a) => a.earned)
    .sort((a, b) => Date.parse(b.earnedAt ?? "") - Date.parse(a.earnedAt ?? ""));
  const pinned = profile.showcaseAchievementIds;
  const pinnedSet = new Set(pinned);
  const showcase = [...earned.filter((a) => pinnedSet.has(a.id)), ...earned.filter((a) => !pinnedSet.has(a.id))];
  const next = all
    .filter((a) => !a.earned && a.progress && a.progress.target > 0)
    .sort((a, b) => b.progress!.current / b.progress!.target - a.progress!.current / a.progress!.target)
    .slice(0, 6);
  const percent = all.length > 0 ? Math.round((earned.length / all.length) * 100) : 0;
  const title = (id: string) => t(`achievements.items.${id}.title` as "achievements.items.critic.title");

  const togglePin = (id: string) => {
    const nextPins = pinnedSet.has(id)
      ? pinned.filter((p) => p !== id)
      : [...pinned, id].slice(-MAX_SHOWCASE_ACHIEVEMENTS);
    update.mutate({ showcaseAchievementIds: nextPins });
  };

  const tabs: Array<{ id: HallTab; label: string; count: number }> = [
    { id: "showcase", label: t("profile.hall.showcase"), count: earned.length },
    ...(next.length > 0 ? [{ id: "next" as const, label: t("profile.hall.next"), count: next.length }] : []),
    { id: "all", label: t("profile.hall.all"), count: all.length },
  ];

  return (
    <Block
      icon={TrophyIcon}
      title={t("profile.hall.title")}
      aside={
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {earned.length} / {all.length} · {percent}%
        </span>
      }
    >
      {/* Rarity counters: earned out of all, per tier. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RARITIES.map((rarity) => {
          const total = all.filter((a) => a.rarity === rarity).length;
          const got = earned.filter((a) => a.rarity === rarity).length;
          return (
            <div key={rarity} className={cn("flex flex-col gap-1 rounded-xl border px-3 py-2", RARITY_CHIP[rarity])}>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {t(`achievements.rarity.${rarity}` as "achievements.rarity.common")}
              </span>
              <span className="font-display text-xl tabular-nums text-foreground">
                {got}
                <span className="text-sm text-muted-foreground"> / {total}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-foreground/10">
                <span className="block h-full rounded-full bg-current" style={{ width: `${total ? (got / total) * 100 : 0}%` }} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-primary/25 bg-primary/5 p-0.5">
          {tabs.map(({ id, label, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary",
              )}
            >
              {label}
              <span className={cn("rounded px-1 tabular-nums", tab === id ? "bg-black/20" : "bg-primary/10 text-primary")}>
                {count}
              </span>
            </button>
          ))}
        </div>
        {own && tab === "showcase" && earned.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <PinIcon className="size-3 text-primary" />
            {t("profile.hall.pinHint", { n: pinned.length, max: MAX_SHOWCASE_ACHIEVEMENTS })}
          </span>
        )}
      </div>

      {tab === "showcase" &&
        (earned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-primary/30 p-5 text-center text-sm text-muted-foreground">
            {t("profile.hall.empty")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 lg:grid-cols-6">
            {showcase.map((a) => {
              const isPinned = pinnedSet.has(a.id);
              return (
                <div
                  key={a.id}
                  className={cn(
                    "group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-colors hover:bg-primary/10",
                    isPinned && "bg-primary/10 ring-1 ring-primary/50",
                  )}
                >
                  <button type="button" onClick={() => setOpened(a)} className="flex flex-col items-center gap-1">
                    <HoloAchievementBadge id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" className="size-12" />
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight">{title(a.id)}</span>
                  </button>
                  {own && (
                    <button
                      type="button"
                      onClick={() => togglePin(a.id)}
                      disabled={update.isPending}
                      aria-label={isPinned ? t("profile.hall.unpin") : t("profile.hall.pin")}
                      title={isPinned ? t("profile.hall.unpin") : t("profile.hall.pin")}
                      className={cn(
                        "absolute right-1 top-1 grid size-6 place-items-center rounded-md transition-all",
                        isPinned
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/90 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100 focus-visible:opacity-100",
                      )}
                    >
                      {isPinned ? <PinOffIcon className="size-3" /> : <PinIcon className="size-3" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {tab === "next" && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {next.map((a, i) => {
            const p = a.progress!;
            const left = Math.max(0, p.target - p.current);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2.5",
                  i === 0 ? "border-primary/50 bg-primary/10" : "border-[var(--accent-line-soft)] bg-card/50",
                )}
              >
                <HoloAchievementBadge id={a.id} rarity={a.rarity} earned={false} progress={p} variant="circle" className="size-11 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {i === 0 && <TargetIcon className="size-3.5 shrink-0 text-primary" />}
                    <span className="truncate">{title(a.id)}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-primary/10">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.current / p.target) * 100)}%` }} />
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {p.current} / {p.target} · {t("profile.hall.left", { n: left })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "all" && (
        <div className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 lg:grid-cols-6">
          {[...all]
            .sort((a, b) => Number(b.earned) - Number(a.earned) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity))
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => a.earned && setOpened(a)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-colors",
                  a.earned ? "hover:bg-primary/10" : "cursor-default opacity-70",
                )}
              >
                <HoloAchievementBadge
                  id={a.id}
                  rarity={a.rarity}
                  earned={a.earned}
                  earnedAt={a.earnedAt}
                  progress={a.progress}
                  variant="circle"
                  className="size-12"
                />
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">{title(a.id)}</span>
              </button>
            ))}
        </div>
      )}

      <AchievementDetailDialog achievement={opened} onOpenChange={(open) => !open && setOpened(null)} />
    </Block>
  );
}

/* -------------------------------------------------------------------------- */
/* Taste DNA                                                                  */
/* -------------------------------------------------------------------------- */

/** One colour per slot, by place, so the bar and the legend always agree. */
const SLOT_COLORS = ["#ff4d6d", "#7cc4ff", "#ffb454", "#4ade80", "#c084fc", "#f472b6"];

/** Genre id → the kind of viewer that genre makes you. */
const PERSONA: Record<number, string> = {
  1: "action",
  2: "adventure",
  4: "comedy",
  7: "mystery",
  8: "drama",
  10: "fantasy",
  13: "historical",
  14: "horror",
  16: "magic",
  17: "martial",
  18: "mecha",
  19: "music",
  22: "romance",
  23: "school",
  24: "scifi",
  27: "shounen",
  29: "space",
  30: "sports",
  36: "sliceOfLife",
  37: "supernatural",
  38: "military",
  40: "psychological",
  41: "thriller",
  42: "seinen",
};

/** How alike two taste profiles are, 0–100: cosine of their genre shares. */
function tasteMatch(a: PublicProfile["stats"]["topGenres"], b: PublicProfile["stats"]["topGenres"]): number {
  const names = new Set([...a.map((g) => g.name), ...b.map((g) => g.name)]);
  const va = new Map(a.map((g) => [g.name, g.count]));
  const vb = new Map(b.map((g) => [g.name, g.count]));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const n of names) {
    const x = va.get(n) ?? 0;
    const y = vb.get(n) ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? Math.round((dot / Math.sqrt(na * nb)) * 100) : 0;
}

/**
 * What someone watches, as a strand of colour: every genre's share of their
 * list in one bar, the kind of viewer the top one makes them, a one-click
 * catalogue of their top genres — and, on someone else's profile, how
 * close their taste is to yours.
 */
export function TasteDna({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const labels = useLabels();
  const { status } = useAuth();
  const { data: genres } = useGenres();
  // Only on someone else's profile, and only signed in: your own genres, to
  // compare against.
  const { data: me } = useMyProfile(!own && status === "authenticated");

  const top = profile.stats.topGenres.slice(0, 6);
  if (profile.hidden.stats || top.length === 0) return null;
  const total = top.reduce((sum, g) => sum + g.count, 0) || 1;
  const idOf = (name: string) => genres?.find((g) => g.name === name)?.id;
  const leadId = idOf(top[0]!.name);
  const persona = (leadId != null && PERSONA[leadId]) || "seeker";
  const mixIds = top
    .slice(0, 2)
    .map((g) => idOf(g.name))
    .filter((id): id is number => id != null);
  const match = me && !own ? tasteMatch(profile.stats.topGenres, me.stats.topGenres) : null;

  return (
    <Block icon={DnaIcon} title={t("profile.taste.title")}>
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl font-display text-lg text-white" style={{ background: SLOT_COLORS[0] }}>
          {labels.genreLabel(top[0]!.name).charAt(0)}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("profile.taste.persona")}</p>
          <p className="truncate font-display text-lg leading-tight">
            {t(`profile.taste.personas.${persona}` as "profile.taste.personas.seeker")}
          </p>
        </div>
      </div>

      {/* The strand: every top genre's share, side by side. */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {top.map((g, i) => (
          <span
            key={g.name}
            title={`${labels.genreLabel(g.name)} · ${Math.round((g.count / total) * 100)}%`}
            style={{ width: `${(g.count / total) * 100}%`, background: SLOT_COLORS[i] }}
            className={cn(i > 0 && "border-l-2 border-background")}
          />
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {top.map((g, i) => {
          const id = idOf(g.name);
          return (
            <li key={g.name}>
              <Link
                to={id != null ? `/browse?genres=${id}` : "/browse"}
                viewTransition
                className="group flex items-center gap-2 text-sm"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: SLOT_COLORS[i] }} />
                <span className="min-w-0 flex-1 truncate font-medium transition-colors group-hover:text-primary">
                  {labels.genreLabel(g.name)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round((g.count / total) * 100)}%</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {match != null && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-3">
          <HeartHandshakeIcon className="size-5 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              {t("profile.taste.match")}
              <span className="font-display text-lg tabular-nums text-primary">{match}%</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-primary/10">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${match}%` }} />
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t(match >= 75 ? "profile.taste.matchHigh" : match >= 45 ? "profile.taste.matchMid" : "profile.taste.matchLow")}
            </span>
          </div>
        </div>
      )}

      {mixIds.length > 0 && (
        <Link
          to={`/browse?genres=${mixIds.join(",")}&orderBy=score`}
          viewTransition
          className="btn-sheen group mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-95"
        >
          {own ? t("profile.taste.mixOwn") : t("profile.taste.mixTheirs")}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </Block>
  );
}
