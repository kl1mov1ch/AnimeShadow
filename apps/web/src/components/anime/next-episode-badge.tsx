import { ClockIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n";

/**
 * "Episode N airs in ~X" for a title that's still currently airing — sourced
 * from AniList's `nextAiringEpisode` (neither Shikimori nor Jikan expose an
 * actual schedule, only "airing" as a status). Ticks over on its own so a
 * page left open doesn't show a stale countdown.
 */
export function NextEpisodeBadge({
  episode,
  airingAt,
}: {
  episode: number;
  airingAt: string;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = Date.parse(airingAt);
  if (!Number.isFinite(target)) return null;
  const diff = target - now;
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.max(1, Math.ceil((diff % 86_400_000) / 3_600_000));
  const countdown =
    days > 0
      ? t("detail.nextEpisodeInDays", { days })
      : t("detail.nextEpisodeInHours", { hours });

  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      <ClockIcon className="size-3.5" />
      {t("detail.nextEpisodeNumber", { episode })} · {countdown}
    </span>
  );
}
