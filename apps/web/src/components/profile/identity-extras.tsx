import type { PublicProfile, Rank } from "@animeshadow/shared";
import { HeartIcon, SparklesIcon, StarIcon } from "lucide-react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Hours of watching each rank starts at — the same thresholds the server uses. */
const RANK_STEPS: Array<{ rank: Rank; from: number }> = [
  { rank: "NOVICE", from: 0 },
  { rank: "ADVANCED", from: 10 },
  { rank: "EXPERT", from: 100 },
  { rank: "LEGEND", from: 500 },
];

const RANK_BAR: Record<Rank, string> = {
  NOVICE: "from-muted-foreground/60 to-emerald-500",
  ADVANCED: "from-emerald-500 to-sky-500",
  EXPERT: "from-sky-500 to-amber-400",
  LEGEND: "from-amber-400 to-amber-300",
};

const PRESENCE_DOT: Record<PublicProfile["onlineStatus"], string> = {
  ONLINE: "bg-emerald-500",
  DND: "bg-rose-500",
  OFFLINE: "bg-muted-foreground/60",
};

/** A dot on the avatar's edge: online, busy, or away. */
export function PresenceDot({ status, className }: { status: PublicProfile["onlineStatus"]; className?: string }) {
  const t = useT();
  const label = t(`profile.presence.${status === "DND" ? "dnd" : status.toLowerCase()}` as "profile.presence.online");
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("absolute size-4 rounded-full ring-[3px] ring-card", PRESENCE_DOT[status], className)}
    >
      {status === "ONLINE" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-40" />
      )}
    </span>
  );
}

/**
 * What fills the identity card under the name: how far to the next rank,
 * the genres this person actually watches, and two small numbers — the
 * average score they give and the likes their comments earned.
 */
export function IdentityExtras({ profile }: { profile: PublicProfile }) {
  const t = useT();
  const labels = useLabels();
  const hours = profile.stats.hoursWatched;
  const index = RANK_STEPS.findIndex((s) => s.rank === profile.rank);
  const current = RANK_STEPS[index] ?? RANK_STEPS[0]!;
  const next = RANK_STEPS[index + 1];
  const percent = next
    ? Math.min(100, Math.max(3, ((hours - current.from) / (next.from - current.from)) * 100))
    : 100;
  const genres = profile.stats.topGenres.slice(0, 3);

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Progress to the next rank. */}
      <div className="flex flex-col gap-1 text-left">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="truncate">
            {next
              ? t("profile.card.nextRank", {
                  rank: t(`profile.rank.${next.rank.toLowerCase()}` as "profile.rank.novice"),
                })
              : t("profile.card.maxRank")}
          </span>
          {next && (
            <span className="shrink-0 tabular-nums">
              {t("profile.card.hoursLeft", { hours: Math.max(1, Math.ceil(next.from - hours)) })}
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700", RANK_BAR[profile.rank])}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Two small numbers side by side. */}
      <div className="grid grid-cols-2 gap-1.5">
        <MiniStat
          icon={<StarIcon className="size-3 fill-amber-400 text-amber-400" />}
          value={profile.stats.meanScore != null ? profile.stats.meanScore.toFixed(1) : "—"}
          label={t("profile.card.meanScore")}
        />
        <MiniStat
          icon={<HeartIcon className="size-3 fill-rose-500 text-rose-500" />}
          value={labels.compact(profile.totalCommentLikes)}
          label={t("profile.card.likes")}
        />
      </div>

      {genres.length > 0 && (
        <div className="flex flex-col items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <SparklesIcon className="size-3" />
            {t("profile.card.favGenres")}
          </span>
          <div className="flex flex-wrap justify-center gap-1">
            {genres.map((g, i) => (
              <span
                key={g.name}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  i === 0
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-border/60 bg-secondary/30 text-foreground/80",
                )}
              >
                {labels.genreLabel(g.name)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border/50 bg-secondary/20 px-1 py-1.5">
      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
        {icon}
        {value}
      </span>
      <span className="truncate text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
