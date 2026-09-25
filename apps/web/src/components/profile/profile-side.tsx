import type { EarnedAchievement, PublicProfile } from "@animeshadow/shared";
import { ChevronRightIcon, SparklesIcon, TrophyIcon } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Link } from "react-router-dom";
import { AchievementDetailDialog } from "@/components/achievement-detail-dialog";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { useGenres } from "@/lib/query";
import { cn } from "@/lib/utils";

function Card({
  icon: Icon,
  title,
  aside,
  children,
}: {
  icon: typeof TrophyIcon;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 font-display text-base tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
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

/**
 * What this account watches most, as shares of its list — a bar per genre
 * rather than a cloud of equal chips, so "mostly action, some romance"
 * reads at a glance. Each one opens that genre in the catalogue.
 */
export function FavoriteGenresCard({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const labels = useLabels();
  const { data: genres } = useGenres();
  const top = profile.stats.topGenres.slice(0, 6);
  if (profile.hidden.stats || top.length === 0) return null;
  const max = Math.max(...top.map((g) => g.count), 1);
  const total = profile.stats.topGenres.reduce((sum, g) => sum + g.count, 0) || 1;

  return (
    <Card icon={SparklesIcon} title={t("profile.overview.favGenres")}>
      <ol className="reveal-group flex flex-col gap-2">
        {top.map((genre, i) => {
          const id = genres?.find((g) => g.name === genre.name)?.id;
          return (
            <li key={genre.name} className="reveal" style={{ "--i": i } as CSSProperties}>
              <Link
                to={id != null ? `/browse?genres=${id}` : "/browse"}
                viewTransition
                className="group flex flex-col gap-1"
              >
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("font-medium transition-colors group-hover:text-primary", i === 0 && "text-primary")}>
                    {labels.genreLabel(genre.name)}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {Math.round((genre.count / total) * 100)}%
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-primary/10">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${(genre.count / max) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/**
 * Achievements, summarised: how many of all, the ones pinned to the name,
 * the most recent, and — on one's own profile — the ones closest to
 * opening, with how far along each is. The full grid is one tap away in a
 * dialog rather than a separate tab.
 */
export function AchievementsCard({
  profile,
  own,
  renderAll,
}: {
  profile: PublicProfile;
  own: boolean;
  /** The full grid, rendered inside the "all" dialog. */
  renderAll: () => React.ReactNode;
}) {
  const t = useT();
  const [opened, setOpened] = useState<EarnedAchievement | null>(null);
  const [all, setAll] = useState(false);

  const earned = profile.achievements
    .filter((a) => a.earned)
    .sort((a, b) => Date.parse(b.earnedAt ?? "") - Date.parse(a.earnedAt ?? ""));
  const total = profile.achievements.length;
  const pinned = new Set(profile.showcaseAchievementIds);
  const shown = [
    ...earned.filter((a) => pinned.has(a.id)),
    ...earned.filter((a) => !pinned.has(a.id)),
  ].slice(0, 8);
  const next = own
    ? profile.achievements
        .filter((a) => !a.earned && a.progress && a.progress.target > 0)
        .sort(
          (a, b) =>
            b.progress!.current / b.progress!.target - a.progress!.current / a.progress!.target,
        )
        .slice(0, 3)
    : [];
  const percent = total > 0 ? Math.round((earned.length / total) * 100) : 0;
  const circumference = 2 * Math.PI * 16;

  return (
    <Card
      icon={TrophyIcon}
      title={t("profile.tabs.achievements")}
      aside={
        <button
          type="button"
          onClick={() => setAll(true)}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
        >
          {t("common.seeAll")}
          <ChevronRightIcon className="size-3.5" />
        </button>
      }
    >
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 40 40" className="size-14 -rotate-90">
          <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="4" className="text-primary/15" />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            className="text-primary transition-[stroke-dashoffset] duration-1000"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
          />
        </svg>
        <div className="flex flex-col">
          <span className="font-display text-xl tabular-nums">
            {earned.length}
            <span className="text-sm text-muted-foreground"> / {total}</span>
          </span>
          <span className="text-[11px] text-muted-foreground">{t("profile.side.earnedShare", { n: percent })}</span>
        </div>
      </div>

      {shown.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {shown.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpened(a)}
              style={{ "--i": i } as CSSProperties}
              title={t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
              className={cn(
                "reveal relative grid place-items-center rounded-xl p-1.5 transition-colors hover:bg-primary/10",
                pinned.has(a.id) && "bg-primary/10 ring-1 ring-primary/40",
              )}
            >
              <HoloAchievementBadge id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" className="size-10" />
            </button>
          ))}
        </div>
      )}

      {next.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--accent-line-soft)] pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("profile.side.next")}
          </span>
          {next.map((a) => {
            const p = a.progress!;
            return (
              <div key={a.id} className="flex flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">
                    {t(`achievements.items.${a.id}.title` as "achievements.items.critic.title")}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.current}/{p.target}
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-primary/10">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.current / p.target) * 100)}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <AchievementDetailDialog achievement={opened} onOpenChange={(open) => !open && setOpened(null)} />
      <Dialog open={all} onOpenChange={setAll}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("profile.tabs.achievements")}</DialogTitle>
          </DialogHeader>
          {renderAll()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
