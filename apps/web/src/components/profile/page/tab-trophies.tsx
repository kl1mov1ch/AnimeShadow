import type { EarnedAchievement, PublicProfile } from "@animeshadow/shared";
import { ACHIEVEMENT_CATEGORIES, MAX_SHOWCASE_ACHIEVEMENTS } from "@animeshadow/shared";
import { PinIcon, PinOffIcon, TrophyIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { AchievementTip, HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { EmptyNote, Pills } from "./kit";

type Category = (typeof ACHIEVEMENT_CATEGORIES)[number] | "all";
type State = "all" | "earned" | "progress" | "locked";

const RARITY_TONE: Record<EarnedAchievement["rarity"], { text: string; glow: string; ring: string }> = {
  common: { text: "text-orange-300", glow: "from-orange-500/15", ring: "ring-orange-400/25" },
  rare: { text: "text-sky-300", glow: "from-sky-500/15", ring: "ring-sky-400/30" },
  epic: { text: "text-violet-300", glow: "from-violet-500/20", ring: "ring-violet-400/35" },
  legendary: { text: "text-amber-300", glow: "from-amber-400/25", ring: "ring-amber-300/45" },
};

const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;

/**
 * Every achievement, as a wall of tiles: earned ones lit in their rarity's
 * colour, those under way with how far along they are, the rest dimmed.
 * Filters by kind and by state; at the top, the share earned and the count
 * per rarity. On one's own profile a pin on each earned tile puts it on the
 * showcase under the name (three at most). A tap opens the achievement.
 */
export function TrophiesTab({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const t = useT();
  const update = useUpdateProfile();
  const [category, setCategory] = useState<Category>("all");
  const [state, setState] = useState<State>("all");
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);
  const all = profile.achievements;
  const earned = all.filter((a) => a.earned);
  const pinned = profile.showcaseAchievementIds;
  const share = all.length > 0 ? Math.round((earned.length / all.length) * 100) : 0;

  const stateOf = (a: EarnedAchievement): State =>
    a.earned ? "earned" : a.progress && a.progress.current > 0 ? "progress" : "locked";

  const shown = useMemo(
    () =>
      all
        .filter((a) => category === "all" || a.category === category)
        .filter((a) => state === "all" || stateOf(a) === state)
        .sort((a, b) => {
          const order = { earned: 0, progress: 1, locked: 2, all: 3 };
          return (
            order[stateOf(a)] - order[stateOf(b)] ||
            RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] ||
            (b.earnedAt ?? "").localeCompare(a.earnedAt ?? "")
          );
        }),
    [all, category, state],
  );

  const togglePin = (id: string) => {
    const next = pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id].slice(-MAX_SHOWCASE_ACHIEVEMENTS);
    update.mutate({ showcaseAchievementIds: next });
  };

  const r = 42;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex flex-col gap-5">
      {/* The summary: share earned, and earned per rarity. */}
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-4">
          <span className="relative grid size-24 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-foreground/10" />
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                className="stroke-primary transition-[stroke-dashoffset] duration-1000"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - share / 100)}
              />
            </svg>
            <span className="text-center">
              <span className="block font-display text-2xl leading-none tabular-nums">{share}%</span>
              <span className="text-[10px] text-muted-foreground">открыто</span>
            </span>
          </span>
          <div>
            <p className="font-display text-xl leading-tight">
              {earned.length} <span className="text-muted-foreground">из {all.length}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {own ? `На витрине ${pinned.length} из ${MAX_SHOWCASE_ACHIEVEMENTS} — закрепите булавкой` : "достижений получено"}
            </p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-4 gap-2">
          {(["legendary", "epic", "rare", "common"] as const).map((rarity) => {
            const total = all.filter((a) => a.rarity === rarity).length;
            const got = earned.filter((a) => a.rarity === rarity).length;
            return (
              <div key={rarity} className={cn("rounded-2xl bg-gradient-to-b to-transparent p-2.5 text-center ring-1", RARITY_TONE[rarity].glow, RARITY_TONE[rarity].ring)}>
                <p className={cn("font-display text-lg leading-none tabular-nums", RARITY_TONE[rarity].text)}>
                  {got}
                  <span className="text-xs text-muted-foreground">/{total}</span>
                </p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{t(`achievements.rarity.${rarity}` as "achievements.rarity.common")}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Pills
          value={category}
          onPick={setCategory}
          options={[
            { value: "all", label: "Все" },
            ...ACHIEVEMENT_CATEGORIES.map((cat) => ({
              value: cat,
              label: t(`achievements.category.${cat}` as "achievements.category.watch"),
              count: all.filter((a) => a.category === cat && a.earned).length,
            })),
          ]}
        />
        <Pills
          value={state}
          onPick={setState}
          options={[
            { value: "all", label: t("achievements.filterAll") },
            { value: "earned", label: t("achievements.filterEarned") },
            { value: "progress", label: t("achievements.filterInProgress") },
            { value: "locked", label: t("achievements.filterLocked") },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyNote icon={TrophyIcon} title={t("achievements.noneInFilter")} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((a, i) => {
            const st = stateOf(a);
            const tone = RARITY_TONE[a.rarity];
            const isPinned = pinned.includes(a.id);
            const percent = a.progress && a.progress.target > 0 ? Math.min(100, (a.progress.current / a.progress.target) * 100) : null;
            return (
              <li
                key={a.id}
                className="relative animate-in fade-in-0 zoom-in-95"
                style={{ animationDelay: `${Math.min(i, 20) * 25}ms`, animationFillMode: "backwards" }}
              >
                <Tooltip>
                <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setOpened(a)}
                  className={cn(
                    "group flex h-full w-full flex-col items-center gap-2 rounded-2xl border p-3 pt-4 text-center transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1",
                    st === "earned"
                      ? cn("border-transparent bg-gradient-to-b to-transparent ring-1", tone.glow, tone.ring)
                      : "border-[var(--accent-line-soft)] bg-background/30 hover:border-foreground/20",
                  )}
                >
                  <span className={cn("achx-tilt transition-[filter,opacity]", st === "locked" && "opacity-40 grayscale")}>
                    <HoloAchievementBadge id={a.id} rarity={a.rarity} earned={a.earned} earnedAt={a.earnedAt} progress={a.progress} variant="circle" tip={false} className="size-16" />
                  </span>
                  <span className="line-clamp-2 text-xs font-semibold leading-snug">
                    {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                  </span>
                  <span className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">
                    {t(`achievements.items.${a.id}.desc` as "achievements.items.critic.desc")}
                  </span>
                  <span className="mt-auto w-full">
                    {st === "earned" ? (
                      <span className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.text)}>
                        {t(`achievements.rarity.${a.rarity}` as "achievements.rarity.common")}
                        {a.earnedAt && <span className="font-normal normal-case tracking-normal text-muted-foreground"> · {new Date(a.earnedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>}
                      </span>
                    ) : percent != null ? (
                      <span className="flex flex-col gap-1">
                        <span className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, percent)}%` }} />
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {a.progress!.current} / {a.progress!.target}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70">{t("achievements.locked")}</span>
                    )}
                  </span>
                </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 p-0">
                  <AchievementTip id={a.id} rarity={a.rarity} earned={a.earned} earnedAt={a.earnedAt} progress={a.progress} />
                </TooltipContent>
                </Tooltip>
                {own && a.earned && (
                  <button
                    type="button"
                    onClick={() => togglePin(a.id)}
                    disabled={update.isPending}
                    aria-label={isPinned ? "Убрать с витрины" : "На витрину"}
                    title={isPinned ? "Убрать с витрины" : "На витрину"}
                    className={cn(
                      "absolute right-2 top-2 grid size-7 place-items-center rounded-full transition-colors",
                      isPinned ? "bg-primary text-primary-foreground" : "bg-black/30 text-muted-foreground hover:bg-primary/20 hover:text-primary",
                    )}
                  >
                    {isPinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <AchievementDetailDialog achievement={opened} onOpenChange={(open) => !open && setOpened(null)} />
    </div>
  );
}
