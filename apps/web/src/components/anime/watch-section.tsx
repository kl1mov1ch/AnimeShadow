import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchSession } from "@/hooks/use-watch-session";
import { useT } from "@/i18n";
import { useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

interface WatchSectionProps {
  anime: Pick<AnimeDetail, "id" | "airing" | "airedFrom">;
  title: string;
  active: boolean;
}

export function WatchSection({ anime, title, active }: WatchSectionProps) {
  const t = useT();
  const releaseDate = anime.airedFrom ? new Date(anime.airedFrom) : null;
  const notYetOut =
    anime.airing === "UPCOMING" &&
    releaseDate != null &&
    releaseDate.getTime() > Date.now();

  const { data, isPending } = useWatchSources(anime.id, active && !notYetOut);

  if (notYetOut && releaseDate) {
    return <Countdown target={releaseDate} />;
  }

  if (isPending && active) {
    return <Skeleton className="mx-auto aspect-video w-full rounded-xl sm:w-[88%]" />;
  }

  if (data?.available && data.sources.length > 0) {
    return <Player data={data} title={title} animeId={anime.id} />;
  }

  const notice =
    data?.reason === "not_configured"
      ? t("watch.notConfigured")
      : data?.reason === "provider_error"
        ? t("watch.providerError")
        : t("watch.notFound");

  return (
    <Alert>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
}

/* ---------- countdown ---------- */

function Countdown({ target }: { target: Date }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, target.getTime() - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);

  const dateLabel = target.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card/60 p-8 text-center">
      <p className="text-sm font-medium text-primary">{t("watch.comingOn", { date: dateLabel })}</p>
      <div className="grid grid-cols-4 gap-3">
        {[
          [days, t("watch.days")],
          [hours, t("watch.hours")],
          [minutes, t("watch.minutes")],
          [seconds, t("watch.seconds")],
        ].map(([value, unit], i) => (
          <div
            key={i}
            className="flex min-w-16 flex-col rounded-lg bg-secondary/60 px-3 py-2"
          >
            <span className="font-display text-3xl tabular-nums">
              {String(value).padStart(2, "0")}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {unit}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("watch.willAppearWhenOut")}</p>
    </div>
  );
}

/* ---------- player ---------- */

/** If the embed hasn't reported `load` by now, assume it's not coming up. */
const STALL_MS = 9_000;

function Player({
  data,
  title,
  animeId,
}: {
  data: WatchResponse;
  title: string;
  animeId: number;
}) {
  const t = useT();
  // Sources arrive ranked best-first (verified-reachable ones lead).
  const [selectedId, setSelectedId] = useState(data.sources[0]?.id ?? "");
  const [showAll, setShowAll] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const current = useMemo(
    () => data.sources.find((s) => s.id === selectedId) ?? data.sources[0],
    [data.sources, selectedId],
  );
  useWatchSession({ animeId, episode: 1, active: true });

  // Reset the stall watch whenever we switch embeds.
  useEffect(() => {
    setLoaded(false);
    setStalled(false);
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [current?.embedUrl]);

  if (!current) return null;

  const alternatives = data.sources.filter((s) => s.id !== current.id);
  const pickerOpen = showAll || (stalled && !loaded);

  const pick = (id: string) => {
    setSelectedId(id);
    setShowAll(false);
  };

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-2.5 sm:w-[88%]">
      {/* Current pick — one line, not a wall of options. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{current.title}</span>
        <SourceKindBadge source={current} />
        <StabilityMark stable={current.stable} />
        {alternatives.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="ml-auto shrink-0 rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {showAll ? t("common.cancel") : t("watch.notWorking")}
          </button>
        )}
      </div>

      {/* Only nudge the user to switch once the current embed actually stalls. */}
      {stalled && !loaded && alternatives.length > 0 && (
        <Alert>
          <AlertDescription>{t("watch.stalledHint")}</AlertDescription>
        </Alert>
      )}

      {pickerOpen && alternatives.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 p-1.5">
          {data.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => pick(source.id)}
              aria-current={source.id === current.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                source.id === current.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {sourceLabel(source, t)}
              </span>
              <StabilityMark stable={source.stable} />
            </button>
          ))}
        </div>
      )}

      <div className="aspect-video overflow-hidden rounded-xl border bg-black">
        <iframe
          key={current.embedUrl}
          src={current.embedUrl}
          title={`${title} — ${current.title}`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          className="size-full"
        />
      </div>
    </div>
  );
}

/** Server-side reachability verdict, so the user can tell picks apart at a glance. */
function StabilityMark({ stable }: { stable: boolean | null }) {
  const t = useT();
  if (stable == null) return null;
  return (
    <span
      title={stable ? t("watch.stableHint") : t("watch.unstableHint")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        stable
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          stable ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {stable ? t("watch.stable") : t("watch.unstable")}
    </span>
  );
}

function SourceKindBadge({ source }: { source: WatchSource }) {
  if (source.kind === "voice") return <Badge variant="secondary">RU/VO</Badge>;
  if (source.kind === "subtitles") return <Badge variant="outline">SUB</Badge>;
  return null;
}

function sourceLabel(source: WatchSource, t: ReturnType<typeof useT>): string {
  const parts = [source.title];
  if (source.episodesCount) {
    parts.push(t("watch.episodesCount", { count: source.episodesCount }));
  }
  if (source.quality) parts.push(source.quality);
  return parts.join(" · ");
}
