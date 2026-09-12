import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useWatchSession } from "@/hooks/use-watch-session";
import { useT } from "@/i18n";
import { useAnimeProgress, useUpdateProgress, useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

interface WatchSectionProps {
  anime: Pick<AnimeDetail, "id" | "airing" | "airedFrom" | "episodes">;
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
  // Warm the TCP/TLS handshake for the top few candidate embeds the moment
  // we know them — that connection setup is otherwise dead time that only
  // starts once the iframe itself is in the DOM.
  usePreconnect(data?.sources);

  if (notYetOut && releaseDate) {
    return <Countdown target={releaseDate} />;
  }

  if (isPending && active) {
    return <Skeleton className="mx-auto aspect-video w-full rounded-xl sm:w-[88%]" />;
  }

  if (data?.available && data.sources.length > 0) {
    return (
      <Player
        data={data}
        title={title}
        animeId={anime.id}
        episodesTotal={anime.episodes}
      />
    );
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

/**
 * Injects <link rel="preconnect"> for the first few distinct embed origins,
 * cleaning them up on change/unmount. Best-effort — a bad URL just gets
 * skipped, never thrown.
 */
function usePreconnect(sources: WatchSource[] | undefined): void {
  useEffect(() => {
    if (!sources || sources.length === 0) return;
    const origins = new Set<string>();
    for (const source of sources) {
      if (origins.size >= 3) break;
      try {
        origins.add(new URL(source.embedUrl).origin);
      } catch {
        /* not an absolute URL — skip */
      }
    }

    const links = [...origins].map((origin) => {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
      return link;
    });

    return () => {
      for (const link of links) link.remove();
    };
  }, [sources]);
}

/**
 * Records roughly where a signed-in user left off on one episode — the
 * embed is a third-party iframe we can't read a real seek position from, so
 * this measures elapsed time the player was open on this episode instead,
 * added onto whatever was already stored for it. Flushes on visibility
 * hide, unmount and episode change, same triggers as useWatchSession.
 */
function useEpisodeTracking({
  animeId,
  episode,
  seedPosition,
  active,
}: {
  animeId: number;
  episode: number;
  seedPosition: number;
  active: boolean;
}): void {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const update = useUpdateProgress(animeId);
  const baseRef = useRef(seedPosition);

  useEffect(() => {
    baseRef.current = seedPosition;
  }, [episode, seedPosition]);

  useEffect(() => {
    if (!authed || !active) return;
    let start = Date.now();

    const flush = () => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      start = Date.now(); // reset so a resume doesn't double-count
      if (elapsed < 15) return;
      baseRef.current += elapsed;
      update.mutate({ episode, positionSeconds: baseRef.current });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else start = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);

    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, active, animeId, episode]);
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
  episodesTotal,
}: {
  data: WatchResponse;
  title: string;
  animeId: number;
  episodesTotal: number | null;
}) {
  const t = useT();
  // Sources arrive ranked best-first (verified-reachable ones lead).
  const [selectedId, setSelectedId] = useState(data.sources[0]?.id ?? "");
  const [showAll, setShowAll] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Mirrors `loaded` for the stall timer's closure below — plain state would
  // be stale by the time the timeout fires (it captures the value from when
  // the effect ran, not the current one), which was the actual bug: a
  // perfectly fine, already-loaded embed still got force-switched every
  // STALL_MS because the check for "did it load?" was missing entirely.
  const loadedRef = useRef(false);
  // Every source this session has already stalled on — so a dead top pick
  // doesn't leave the user staring at it for minutes: we cycle through the
  // rest automatically and only ask them to pick once nothing loads.
  const [triedIds, setTriedIds] = useState<string[]>([]);

  const current = useMemo(
    () => data.sources.find((s) => s.id === selectedId) ?? data.sources[0],
    [data.sources, selectedId],
  );

  const { status } = useAuth();
  const authed = status === "authenticated";

  // The embed is a third-party iframe (Kodik/Alloha) with its own internal
  // episode navigation we can't read — so unlike video position, "which
  // episode" is something the viewer tells us, seeded from wherever they
  // last left off. Only signed-in viewers get anywhere with this (nothing
  // persists for an anonymous visit), so the control itself only shows for
  // them — no point offering a stepper that quietly does nothing.
  const { data: progress } = useAnimeProgress(animeId, authed);
  const [episode, setEpisode] = useState(1);
  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    if (resumeAppliedRef.current) return;
    if (progress?.resumeEpisode != null) {
      setEpisode(progress.resumeEpisode);
      resumeAppliedRef.current = true;
    }
  }, [progress]);

  const episodeRecord = progress?.episodes.find((e) => e.episode === episode);
  useEpisodeTracking({
    animeId,
    episode,
    seedPosition: episodeRecord?.positionSeconds ?? 0,
    active: true,
  });
  useWatchSession({ animeId, episode, active: true });
  const update = useUpdateProgress(animeId);

  // Reset the stall watch whenever we switch embeds.
  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setStalled(false);
    const timer = setTimeout(() => {
      if (loadedRef.current) return; // it loaded fine — nothing to do
      setStalled(true);
      setTriedIds((tried) => {
        const nextTried = current ? [...tried, current.id] : tried;
        const next = data.sources.find((s) => !nextTried.includes(s.id));
        if (next) setSelectedId(next.id);
        return nextTried;
      });
    }, STALL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.embedUrl]);

  if (!current) return null;

  const alternatives = data.sources.filter((s) => s.id !== current.id);
  const exhausted = data.sources.every((s) => triedIds.includes(s.id));
  const pickerOpen = showAll || (stalled && !loaded);

  const pick = (id: string) => {
    setSelectedId(id);
    setShowAll(false);
  };

  const goToEpisode = (next: number, markCurrentDone: boolean) => {
    if (next < 1) return;
    if (episodesTotal != null && next > episodesTotal) return;
    if (markCurrentDone) {
      update.mutate({
        episode,
        positionSeconds: episodeRecord?.positionSeconds ?? 0,
        completed: true,
      });
    }
    setEpisode(next);
  };

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-2.5 sm:w-[88%]">
      {/* Which episode — the embed can't tell us, so the viewer does. Only
          shown signed-in: for an anonymous visit nothing here is saved, so a
          control that quietly does nothing would just be confusing. */}
      {authed && (
        <div className="flex items-center justify-center gap-1 self-center rounded-full border border-border/60 bg-card/60 p-1">
          <button
            type="button"
            onClick={() => goToEpisode(episode - 1, false)}
            disabled={episode <= 1}
            aria-label={t("watch.prevEpisode")}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-0 truncate px-1.5 text-sm font-medium tabular-nums">
            {episodesTotal
              ? t("watch.episodeOf", { episode, total: episodesTotal })
              : t("watch.episodeBare", { episode })}
          </span>
          <button
            type="button"
            onClick={() => goToEpisode(episode + 1, true)}
            disabled={episodesTotal != null && episode >= episodesTotal}
            aria-label={t("watch.nextEpisode")}
            className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      )}

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

      {/* Only nudge the user once the current embed actually stalls — while
          alternatives remain we're already auto-switching, so say that
          instead of asking them to do it manually. */}
      {stalled && !loaded && alternatives.length > 0 && (
        <Alert>
          <AlertDescription>
            {exhausted ? t("watch.allFailedHint") : t("watch.stalledHint")}
          </AlertDescription>
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
          onLoad={() => {
            loadedRef.current = true;
            setLoaded(true);
          }}
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
