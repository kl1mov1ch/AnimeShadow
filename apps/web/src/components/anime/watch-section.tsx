import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  Maximize2Icon,
  RefreshCwIcon,
  ShuffleIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
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
  /** Which episode is loaded — lifted up so a separate Episodes section can jump the player. */
  episode: number;
  onEpisodeChange: (episode: number) => void;
}

export function WatchSection({
  anime,
  title,
  active,
  episode,
  onEpisodeChange,
}: WatchSectionProps) {
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
        episode={episode}
        onEpisodeChange={onEpisodeChange}
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
      const url =
        source.format === "hls"
          ? Object.values(source.hlsEpisodes ?? {})[0]
          : source.embedUrl;
      if (!url) continue;
      try {
        origins.add(new URL(url).origin);
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

/** If neither racer has reported `load` by now, assume this batch is dead. */
const STALL_MS = 6_000;
/** Later batches get less patience — we're already in "keep hunting" mode. */
const STALL_MS_RETRY = 4_000;
const HOLD_REPEAT_DELAY_MS = 380;
const HOLD_REPEAT_INTERVAL_MS = 90;

/**
 * A button that fires `onClick` for a normal press (mouse click or keyboard
 * Enter/Space — both raise a native "click", so that's the single source of
 * truth for "short press"), but switches to firing `onRepeat` on an interval
 * once held past HOLD_REPEAT_DELAY_MS, for fast-scrolling through episodes.
 * The click that naturally follows releasing a hold is swallowed once so it
 * doesn't also count as a step.
 */
function useHoldRepeat(onClick: () => void, onRepeat: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heldRef = useRef(false);

  const clear = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };
  useEffect(() => clear, []);

  return {
    onPointerDown: () => {
      timeoutRef.current = setTimeout(() => {
        heldRef.current = true;
        onRepeat();
        intervalRef.current = setInterval(onRepeat, HOLD_REPEAT_INTERVAL_MS);
      }, HOLD_REPEAT_DELAY_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onClick: () => {
      clear();
      if (heldRef.current) {
        heldRef.current = false; // trailing click after a hold — already stepped, ignore
        return;
      }
      onClick();
    },
  };
}

/**
 * Which episode you're on, editable directly — the embed can't tell us this,
 * so the viewer does. Arrows step by one on a normal click and fast-scroll on
 * hold; the number itself is a plain text field so you can jump straight to
 * wherever you actually left off instead of clicking through every episode.
 */
function EpisodeStepper({
  episode,
  episodesTotal,
  onSeek,
  onAdvanceClick,
  onRetreatClick,
}: {
  episode: number;
  episodesTotal: number | null;
  /** Pure reposition — hold-to-repeat and manual entry, no side effects. */
  onSeek: (next: number) => void;
  /** A single click on the arrows — may carry side effects (see Player). */
  onAdvanceClick: () => void;
  onRetreatClick: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(String(episode));
  const [editing, setEditing] = useState(false);
  // The repeat interval's own callback is created once per hold and never
  // re-reads props/state from a fresh render, so it needs a ref to see the
  // current episode instead of a value closed over when the hold started.
  const episodeRef = useRef(episode);
  useEffect(() => {
    episodeRef.current = episode;
    if (!editing) setDraft(String(episode));
  }, [episode, editing]);

  const step = (dir: 1 | -1) => {
    const next = episodeRef.current + dir;
    if (next < 1) return;
    if (episodesTotal != null && next > episodesTotal) return;
    onSeek(next);
  };

  const commit = () => {
    setEditing(false);
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(episode));
      return;
    }
    const clamped = Math.max(1, episodesTotal != null ? Math.min(episodesTotal, parsed) : parsed);
    onSeek(clamped);
  };

  const prevHold = useHoldRepeat(onRetreatClick, () => step(-1));
  const nextHold = useHoldRepeat(onAdvanceClick, () => step(1));

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-card/60 py-1 pl-1 pr-1.5">
      <button
        type="button"
        {...prevHold}
        disabled={episode <= 1}
        aria-label={t("watch.prevEpisode")}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40 sm:size-8"
      >
        <ChevronLeftIcon className="size-4 sm:size-3.5" />
      </button>

      <input
        type="text"
        inputMode="numeric"
        value={editing ? draft : String(episode)}
        aria-label={t("watch.episodeInputLabel")}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-7 shrink-0 rounded-md bg-primary/10 text-center text-sm font-semibold tabular-nums text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-6"
      />
      {episodesTotal != null && (
        <span className="shrink-0 text-xs text-muted-foreground">/ {episodesTotal}</span>
      )}

      <button
        type="button"
        {...nextHold}
        disabled={episodesTotal != null && episode >= episodesTotal}
        aria-label={t("watch.nextEpisode")}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-40 sm:size-8"
      >
        <ChevronRightIcon className="size-4 sm:size-3.5" />
      </button>

      <InfoTooltip>{t("watch.episodeHelpBody")}</InfoTooltip>
    </div>
  );
}

/** How many candidate embeds load in parallel before one is shown. */
const RACE_SIZE = 2;

/** Sources the stability probe already confirmed dead. Automatic racing and
 * retry skip these entirely — there's no point spending a stall timeout
 * rediscovering what a server-side probe already answered — falling back to
 * the full list only if literally nothing else is left to try. The manual
 * "not working" list still shows every source, clearly badged, as an
 * override the viewer can reach for themselves. */
function viableSources(sources: WatchSource[]): WatchSource[] {
  const ok = sources.filter((s) => s.stable !== false);
  return ok.length > 0 ? ok : sources;
}

/**
 * A source already confirmed reachable (`stable === true`) — AniLibria,
 * almost always, since it's ranked to win that spot whenever it has the
 * title — is trusted alone instead of raced against a lower-ranked pick.
 * Racing it anyway was the actual bug: a merely-faster Kodik/Alloha mirror
 * could "win" over the pick the stability probe had already verified,
 * purely on timing, so the confirmed-good default rarely got shown. Only a
 * genuinely uncertain top pick (never probed, or its own last probe failed)
 * still races two at once as a hedge.
 */
function initialRacePool(sources: WatchSource[]): string[] {
  const viable = viableSources(sources);
  const poolSize = viable[0]?.stable === true ? 1 : RACE_SIZE;
  return viable.slice(0, poolSize).map((s) => s.id);
}

/** The URL to actually load right now — for an "hls" source this genuinely
 * depends on which episode is selected (unlike an iframe, which never
 * changes per episode); falls back to whatever episode it does have if the
 * exact one is missing rather than showing nothing. */
function sourceUrlFor(source: WatchSource, episode: number): string | null {
  if (source.format !== "hls") return source.embedUrl;
  return (
    source.hlsEpisodes?.[String(episode)] ??
    Object.values(source.hlsEpisodes ?? {})[0] ??
    null
  );
}

/**
 * A direct HLS stream (AniLibria) — Safari plays `.m3u8` natively, everything
 * else needs hls.js, loaded lazily so the ~50 KB of it never ships to a
 * visitor whose sources are all plain iframes. Reloads on every `src` change
 * (an episode switch) without remounting the element, so the same racing/
 * fullscreen refs stay valid across it.
 */
function HlsVideo({
  src,
  isWinner,
  onReady,
  mediaRef,
}: {
  src: string;
  isWinner: boolean;
  onReady: () => void;
  mediaRef: (el: HTMLVideoElement | null) => void;
}) {
  const elRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = elRef.current;
    if (!video) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true });
          instance.loadSource(src);
          instance.attachMedia(video);
          hls = instance;
        } else {
          // No native support and hls.js says it can't help either — set it
          // anyway; a handful of very old browsers still get lucky.
          video.src = src;
        }
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const video = elRef.current;
    if (!video) return;
    video.muted = !isWinner;
    if (isWinner) void video.play().catch(() => undefined);
    else video.pause();
  }, [isWinner]);

  return (
    <video
      ref={(el) => {
        elRef.current = el;
        mediaRef(el);
      }}
      playsInline
      muted
      controls={isWinner}
      onCanPlay={onReady}
      className={cn("absolute inset-0 size-full", !isWinner && "opacity-0")}
      tabIndex={isWinner ? undefined : -1}
      aria-hidden={isWinner ? undefined : true}
    />
  );
}

function Player({
  data,
  title,
  animeId,
  episodesTotal,
  episode,
  onEpisodeChange,
}: {
  data: WatchResponse;
  title: string;
  animeId: number;
  episodesTotal: number | null;
  episode: number;
  onEpisodeChange: (episode: number) => void;
}) {
  const t = useT();
  // Sources arrive ranked best-first (verified-reachable ones lead). Rather
  // than load one and wait to find out it's dead, load the top few at once,
  // invisibly, and show whichever answers first — the viewer never watches
  // a stall timer count down on a source that was going to fail anyway.
  // Except when the top pick is already confirmed reachable (see
  // initialRacePool) — then it's shown alone, trusted outright.
  const [racePool, setRacePool] = useState<string[]>(() => initialRacePool(data.sources));
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Every source this session has already raced and lost — so a handful of
  // dead mirrors don't leave the user staring at a spinner for minutes: we
  // keep pulling in fresh batches automatically and only ask them to pick
  // once nothing is left to try.
  const [triedIds, setTriedIds] = useState<string[]>([]);

  const winner = data.sources.find((s) => s.id === winnerId) ?? null;
  // Shown in the info row even before a winner exists, so it isn't blank
  // while racing — almost always the eventual winner anyway, since it's
  // ranked first for a reason.
  const displaySource =
    winner ?? data.sources.find((s) => s.id === racePool[0]) ?? data.sources[0];

  const { status } = useAuth();
  const authed = status === "authenticated";

  // The embed is a third-party iframe (Kodik/Alloha) with its own internal
  // episode navigation we can't read — so unlike video position, "which
  // episode" is something the viewer tells us, seeded from wherever they
  // last left off. Only signed-in viewers get anywhere with this (nothing
  // persists for an anonymous visit), so the control itself only shows for
  // them — no point offering a stepper that quietly does nothing.
  const { data: progress } = useAnimeProgress(animeId, authed);
  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    if (resumeAppliedRef.current) return;
    if (progress?.resumeEpisode != null) {
      onEpisodeChange(progress.resumeEpisode);
      resumeAppliedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const episodeRecord = progress?.episodes.find((e) => e.episode === episode);
  // Recording "watched" needs real evidence, not just "this page was open":
  // a source has to have actually loaded (not still racing/searching), *and*
  // the player has to be scrolled into view — reading the synopsis or
  // scrolling through characters with the embed sitting off-screen shouldn't
  // silently log a session. Toggling `watching` re-triggers each hook's own
  // flush-and-restart, the same way a tab-hide already does.
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const watching = winnerId != null && inView;

  useEpisodeTracking({
    animeId,
    episode,
    seedPosition: episodeRecord?.positionSeconds ?? 0,
    active: watching,
  });
  useWatchSession({ animeId, episode, active: watching });
  const update = useUpdateProgress(animeId);

  // Stall watch for the current race batch — cleared the instant any of them
  // loads. If the whole batch times out, retire it and pull the next one; a
  // shorter fuse each round, since by then we're already in "keep hunting"
  // mode and every extra second is one the first attempt already spent.
  useEffect(() => {
    if (winnerId != null || racePool.length === 0) return;
    const timeout = triedIds.length === 0 ? STALL_MS : STALL_MS_RETRY;
    const timer = setTimeout(() => {
      setTriedIds((tried) => {
        const nextTried = [...tried, ...racePool];
        const remaining = viableSources(data.sources).filter(
          (s) => !nextTried.includes(s.id),
        );
        setRacePool(remaining.slice(0, RACE_SIZE).map((s) => s.id));
        return nextTried;
      });
    }, timeout);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racePool, winnerId]);

  if (!displaySource) return null;

  const alternatives = data.sources.filter((s) => s.id !== displaySource.id);
  const searching = winnerId == null && racePool.length > 0;
  const exhausted = winnerId == null && racePool.length === 0;
  // Auto-retry is the offered fix when everything's failed — the raw list is
  // now an opt-in "pick manually" escape hatch (via the existing "not
  // working" toggle), not something dumped on the viewer automatically.
  const pickerOpen = showAll;

  const pick = (id: string) => {
    setWinnerId(null);
    setRacePool([id]);
    setShowAll(false);
  };

  const handleLoad = (id: string) => {
    setWinnerId((current) => {
      if (current != null) return current;
      // Keep the winner's own iframe mounted (same DOM node, same key) —
      // dropping every other racer immediately, but never remounting the
      // one that just finished loading.
      setRacePool([id]);
      return id;
    });
  };

  // A stuck third-party embed gives us no signal to detect automatically —
  // no access to its internal player state. What we *can* do is offer the
  // fix after a source has had a fair amount of time to misbehave, and make
  // taking it a single click rather than a raw list of source names the
  // viewer has to make sense of themselves. Resets whenever the winner
  // itself changes (a fresh pick deserves a fresh chance before nagging).
  const [showStuckHint, setShowStuckHint] = useState(false);
  useEffect(() => {
    if (winnerId == null || alternatives.length === 0) {
      setShowStuckHint(false);
      return;
    }
    const timer = setTimeout(() => setShowStuckHint(true), 45_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId, data.sources.length]);

  /** Retries from the very top, as if the page had just been opened. */
  const retryAll = () => {
    setTriedIds([]);
    setWinnerId(null);
    setRacePool(initialRacePool(data.sources));
  };

  /** One click, no source names to make sense of — moves straight to the next best untried pick. */
  const switchNow = () => {
    setShowStuckHint(false);
    const exclude = new Set(winnerId ? [...triedIds, winnerId] : triedIds);
    const remaining = viableSources(data.sources).filter((s) => !exclude.has(s.id));
    if (remaining.length === 0) {
      retryAll();
      return;
    }
    setTriedIds((tried) => (winnerId ? [...tried, winnerId] : tried));
    setWinnerId(null);
    setRacePool(remaining.slice(0, RACE_SIZE).map((s) => s.id));
  };

  const winnerMediaRef = useRef<HTMLIFrameElement | HTMLVideoElement | null>(null);
  const enterFullscreen = () => {
    const el = winnerMediaRef.current;
    if (!el) return;
    const request =
      el.requestFullscreen?.bind(el) ??
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.bind(
        el,
      );
    request?.();
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
    onEpisodeChange(next);
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto flex w-full min-w-0 flex-col gap-2.5 sm:w-[88%]"
    >
      {/* Current pick, one line — the episode control lives right in it
          (only for signed-in viewers: nothing persists otherwise, so a
          control that quietly does nothing would just be confusing)
          instead of floating on its own row above the player. One card
          instead of bare text/buttons on the page background, so the whole
          row reads as a single control bar. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
        {authed && (
          <EpisodeStepper
            episode={episode}
            episodesTotal={episodesTotal}
            onSeek={onEpisodeChange}
            onAdvanceClick={() => goToEpisode(episode + 1, true)}
            onRetreatClick={() => goToEpisode(episode - 1, false)}
          />
        )}
        <span className="min-w-0 truncate font-medium">{displaySource.title}</span>
        <SourceKindBadge source={displaySource} />
        <StabilityMark stable={displaySource.stable} />
        {searching && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            {t("watch.findingSource")}
          </span>
        )}
        {alternatives.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "ml-auto shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:px-2.5 sm:py-1",
              showAll
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary",
            )}
          >
            {showAll ? t("common.cancel") : t("watch.notWorking")}
          </button>
        )}
      </div>

      {/* Nothing worked automatically — offer the fix as one button, not a
          list of source names the viewer has to interpret themselves. The
          manual list is still there (via "not working" above) for the rare
          case even this doesn't help. */}
      {exhausted && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-4 text-center">
          <p className="text-sm text-muted-foreground">{t("watch.allFailedHint")}</p>
          <Button size="sm" onClick={retryAll}>
            <RefreshCwIcon />
            {t("watch.retry")}
          </Button>
        </div>
      )}

      <Dialog open={showStuckHint} onOpenChange={setShowStuckHint}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("watch.stuckModalTitle")}</DialogTitle>
            <DialogDescription>{t("watch.stuckModalBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStuckHint(false)}>
              {t("watch.stuckModalDismiss")}
            </Button>
            <Button onClick={switchNow}>
              <ShuffleIcon />
              {t("watch.stuckModalSwitch")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pickerOpen && alternatives.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card/40 p-1.5">
          {data.sources.map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => pick(source.id)}
              aria-current={source.id === displaySource.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                source.id === displaySource.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  source.id === displaySource.id ? "bg-primary" : "bg-border",
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {sourceLabel(source, t)}
              </span>
              <StabilityMark stable={source.stable} />
            </button>
          ))}
        </div>
      )}

      {/* Bleeds past the page's own side padding on mobile — the actual
          video is what benefits from real size on a small screen; the
          controls above/below it stay comfortably padded. Desktop keeps its
          rounded corners since there's no width to gain there anyway. */}
      <div className="relative -mx-5 aspect-video overflow-hidden border bg-black sm:mx-0 sm:rounded-xl">
        {racePool.map((id) => {
          const source = data.sources.find((s) => s.id === id);
          if (!source) return null;
          const isWinner = id === winnerId;

          if (source.format === "hls") {
            const url = sourceUrlFor(source, episode);
            if (!url) return null;
            return (
              <HlsVideo
                key={source.id}
                src={url}
                isWinner={isWinner}
                onReady={() => handleLoad(id)}
                mediaRef={(el) => {
                  if (isWinner) winnerMediaRef.current = el;
                }}
              />
            );
          }

          return (
            <iframe
              key={source.id}
              ref={
                isWinner
                  ? (el) => {
                      winnerMediaRef.current = el;
                    }
                  : undefined
              }
              src={source.embedUrl}
              title={`${title} — ${source.title}`}
              // Autoplay permission only ever goes to the confirmed winner —
              // a racer that's still invisible has no business making sound
              // even if its own page tries to.
              allow={
                isWinner
                  ? "autoplay; fullscreen; encrypted-media; picture-in-picture"
                  : "encrypted-media; picture-in-picture"
              }
              referrerPolicy="no-referrer"
              onLoad={() => handleLoad(id)}
              className={cn("absolute inset-0 size-full", !isWinner && "opacity-0")}
              tabIndex={isWinner ? undefined : -1}
              aria-hidden={isWinner ? undefined : true}
            />
          );
        })}
        {/* The embed's own controls are cramped on a narrow phone screen —
            a dedicated fullscreen button is easier to hit than hunting for
            the tiny one inside the third-party player's own UI. Desktop's
            box is already large enough that this isn't needed there. */}
        {winnerId != null && (
          <button
            type="button"
            onClick={enterFullscreen}
            aria-label={t("watch.fullscreen")}
            className="absolute bottom-2 right-2 z-10 flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur transition-colors hover:bg-background hover:text-primary sm:hidden"
          >
            <Maximize2Icon className="size-4" />
          </button>
        )}
        {searching && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-white/70">
            <Loader2Icon className="size-6 animate-spin text-primary" />
            <p className="text-xs">{t("watch.findingSource")}</p>
          </div>
        )}
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
