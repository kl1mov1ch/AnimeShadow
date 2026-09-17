import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GaugeIcon,
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ShuffleIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
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

      {/* A hover tooltip is a desktop affordance anyway — on a phone it's one
          more tap target crowding the bar. */}
      <span className="hidden sm:inline-flex">
        <InfoTooltip>{t("watch.episodeHelpBody")}</InfoTooltip>
      </span>
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
 * A source already confirmed reachable (`stable === true`), or our own HLS
 * player (AniLibria — ranked to lead outright whenever it has the title, see
 * rankSource server-side), is trusted alone instead of raced against a
 * lower-ranked pick. Racing either was a real bug, just two different
 * shapes of it: a merely-faster Kodik/Alloha mirror could "win" over a pick
 * the stability probe had already verified, purely on timing; and the HLS
 * player specifically could never win a fair race even when it *was* the
 * better pick — its "ready" signal is genuinely later (hls.js's chunk,
 * fetching the manifest, then the first segment) than an iframe's `onLoad`,
 * which fires the instant the embed's outer document loads, nowhere near
 * "the video is actually ready". Racing them on load order alone meant the
 * ranked-first custom player almost always lost to a plain iframe regardless
 * of rank. Only a genuinely uncertain top pick (a third-party iframe, never
 * probed or its last probe failed) still races two at once as a hedge.
 */
function initialRacePool(sources: WatchSource[]): string[] {
  const viable = viableSources(sources);
  const top = viable[0];
  const trustAlone = top != null && (top.stable === true || top.format === "hls");
  return viable.slice(0, trustAlone ? 1 : RACE_SIZE).map((s) => s.id);
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

/** How long the control bar stays up after the last interaction once
 * playback is under way — long enough to read the time/title, short
 * enough to get out of the way of the actual video. */
const CONTROLS_HIDE_MS = 2600;
const SKIP_SECONDS = 10;
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A direct HLS stream (AniLibria) — Safari plays `.m3u8` natively, everything
 * else needs hls.js, loaded lazily so the ~50 KB of it never ships to a
 * visitor whose sources are all plain iframes. Reloads on every `src` change
 * (an episode switch) without remounting the element, so playback state and
 * the fullscreen target stay valid across it.
 *
 * Ships its own control bar instead of the browser's native `<video
 * controls>` — a third-party iframe (Kodik/Alloha) already brings its own
 * player UI; this is the one source where AnimeShadow *is* the player, so it
 * gets to look like the rest of the site (rounded pills, the primary accent
 * on the seek bar) instead of whatever the platform's stock controls render.
 */
function CustomHlsPlayer({
  src,
  isWinner,
  onReady,
  onPlayingChange,
}: {
  src: string;
  isWinner: boolean;
  onReady: () => void;
  /** Only ever fires for the winner — a deliberate pause shouldn't count as "stuck". */
  onPlayingChange: (playing: boolean) => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read from the src-loading effect below without re-running it on every
  // isWinner flip — it only needs to know, at the moment a *new episode's*
  // manifest finishes loading, whether to resume playback automatically.
  const isWinnerRef = useRef(isWinner);
  useEffect(() => {
    isWinnerRef.current = isWinner;
  }, [isWinner]);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  // Load the manifest — native on Safari, hls.js everywhere else. Resumes
  // playback itself if this load was triggered by switching episodes while
  // already the winner (assigning a fresh `src` otherwise leaves autoplay
  // up to the browser, which usually just... doesn't).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;

    const resumeIfWinner = () => {
      if (!isWinnerRef.current) return;
      video.muted = false;
      void video.play().catch(() => undefined);
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      resumeIfWinner();
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          const instance = new Hls({ enableWorker: true });
          instance.loadSource(src);
          instance.attachMedia(video);
          instance.on(Hls.Events.MANIFEST_PARSED, resumeIfWinner);
          hls = instance;
        } else {
          // No native support and hls.js says it can't help either — set it
          // anyway; a handful of very old browsers still get lucky.
          video.src = src;
          resumeIfWinner();
        }
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [src]);

  // Only the winner actually plays and makes sound — every other racer
  // sits muted and paused behind it until it either wins or is dropped.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isWinner) {
      video.muted = false;
      void video.play().catch(() => undefined);
    } else {
      video.muted = true;
      video.pause();
    }
  }, [isWinner]);

  // Native media events -> our own state, so the bar below is drawn from
  // the element's real state instead of guessed at.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onProgress = () => {
      const ranges = video.buffered;
      setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
    };
    const onPlay = () => {
      setPlaying(true);
      if (isWinner) onPlayingChange(true);
    };
    const onPause = () => {
      setPlaying(false);
      if (isWinner) onPlayingChange(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onRateChange = () => setSpeed(video.playbackRate);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ratechange", onRateChange);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ratechange", onRateChange);
    };
  }, [isWinner, onPlayingChange]);

  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Auto-hide once playback is running and nothing's been touched for a
  // bit; paused always keeps the bar up (nothing else to look at then).
  const wake = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playing) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    }
  };
  useEffect(() => {
    wake();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    wake();
  };

  const skip = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(
      Math.max(0, video.currentTime + delta),
      video.duration || Number.POSITIVE_INFINITY,
    );
    wake();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    wake();
  };

  const changeVolume = (next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    video.muted = next === 0;
    wake();
  };

  const changeSpeed = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setSpeedMenuOpen(false);
    wake();
  };

  /** iOS Safari has no arbitrary-element fullscreen at all — only the
   * `<video>` itself can go fullscreen there. Everywhere else, the whole
   * container goes fullscreen so our own control bar stays on top of the
   * video instead of disappearing along with it. */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (video?.webkitEnterFullscreen && !document.fullscreenEnabled) {
      video.webkitEnterFullscreen();
      return;
    }
    const container = containerRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;
    const request =
      container?.requestFullscreen?.bind(container) ??
      container?.webkitRequestFullscreen?.bind(container);
    request?.();
  };

  const togglePip = () => {
    const video = videoRef.current as
      | (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> })
      | null;
    if (!video?.requestPictureInPicture) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    } else {
      void video.requestPictureInPicture().catch(() => undefined);
    }
  };

  // Keyboard shortcuts — only the actual winner responds, and never while
  // an input/textarea elsewhere on the page (the episode number field, a
  // comment box) is what the keystroke was actually meant for.
  useEffect(() => {
    if (!isWinner) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea)$/i.test(target.tagName)) return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
          skip(-5);
          break;
        case "arrowright":
          skip(5);
          break;
        case "arrowup":
          e.preventDefault();
          changeVolume(Math.min(1, video.volume + 0.05));
          break;
        case "arrowdown":
          e.preventDefault();
          changeVolume(Math.max(0, video.volume - 0.05));
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWinner]);

  const shownTime = scrubTime ?? currentTime;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const canPip =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 size-full bg-black",
        !isWinner && "pointer-events-none opacity-0",
      )}
      onMouseMove={wake}
      onTouchStart={wake}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        onCanPlay={onReady}
        className="absolute inset-0 size-full"
        tabIndex={-1}
      />

      {isWinner && (
        <>
          {/* Tap/click anywhere on the video toggles play — the bar below
              handles everything else. Sits under the centred play button
              (rendered after, so it wins the hit test in that one spot). */}
          <button
            type="button"
            aria-label={playing ? t("watch.pause") : t("watch.play")}
            onClick={togglePlay}
            className="absolute inset-0 cursor-pointer"
          />

          {playing && buffering && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2Icon className="size-8 animate-spin text-white/80" />
            </div>
          )}

          {!playing && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={t("watch.play")}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-transform hover:scale-105">
                <PlayIcon className="size-7 fill-current" />
              </span>
            </button>
          )}

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="group relative flex h-4 items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-white/35" style={{ width: `${bufferedPct}%` }} />
              </div>
              <Slider
                value={[shownTime]}
                min={0}
                max={duration || 0}
                step={0.1}
                onValueChange={([v]) => setScrubTime(v ?? 0)}
                onValueCommit={([v]) => {
                  const video = videoRef.current;
                  if (video && v != null) video.currentTime = v;
                  setScrubTime(null);
                  wake();
                }}
                className="relative [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:transition-opacity [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-primary group-hover:[&_[data-slot=slider-thumb]]:opacity-100"
              />
            </div>

            <div className="flex items-center gap-0.5 text-white">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? t("watch.pause") : t("watch.play")}
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
              >
                {playing ? (
                  <PauseIcon className="size-4 fill-current" />
                ) : (
                  <PlayIcon className="size-4 fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => skip(-SKIP_SECONDS)}
                aria-label={t("watch.skipBack")}
                className="hidden size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 sm:flex"
              >
                <RotateCcwIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => skip(SKIP_SECONDS)}
                aria-label={t("watch.skipForward")}
                className="hidden size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 sm:flex"
              >
                <RotateCwIcon className="size-4" />
              </button>

              {/* Volume — a hover-reveal slider where hover exists at all; a
                  phone just gets the mute toggle (dragging a sliver-thin
                  slider on touch fights the page's own scroll gesture). */}
              <div className="group hidden items-center sm:flex">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted || volume === 0 ? t("watch.unmute") : t("watch.mute")}
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
                >
                  {muted || volume === 0 ? (
                    <VolumeXIcon className="size-4" />
                  ) : (
                    <Volume2Icon className="size-4" />
                  )}
                </button>
                <div className="w-0 overflow-hidden transition-all group-hover:w-16 group-focus-within:w-16">
                  <Slider
                    value={[muted ? 0 : volume]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([v]) => changeVolume(v ?? 0)}
                    className="w-16 px-1 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-track]]:h-1"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted || volume === 0 ? t("watch.unmute") : t("watch.mute")}
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 sm:hidden"
              >
                {muted || volume === 0 ? (
                  <VolumeXIcon className="size-4" />
                ) : (
                  <Volume2Icon className="size-4" />
                )}
              </button>

              <span className="ml-1 shrink-0 text-xs tabular-nums text-white/80">
                {formatTime(shownTime)} / {formatTime(duration)}
              </span>

              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <Popover open={speedMenuOpen} onOpenChange={setSpeedMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("watch.speed")}
                      className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors hover:bg-white/15"
                    >
                      <GaugeIcon className="size-3.5" />
                      {speed}x
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-28 p-1">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changeSpeed(rate)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                          rate === speed
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground/80 hover:bg-secondary/60",
                        )}
                      >
                        {rate}x
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {canPip && (
                  <button
                    type="button"
                    onClick={togglePip}
                    aria-label={t("watch.pip")}
                    className="hidden size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 sm:flex"
                  >
                    <PictureInPicture2Icon className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? t("watch.exitFullscreen") : t("watch.fullscreen")}
                  className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/15"
                >
                  {isFullscreen ? (
                    <Minimize2Icon className="size-4" />
                  ) : (
                    <Maximize2Icon className="size-4" />
                  )}
                </button>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
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
  // Real signal for the HLS player only — a cross-origin iframe embed gives
  // us no way to tell "paused" from "stuck", so this just stays false (never
  // suppresses the hint) for those, same as before. Reset on every new
  // winner so a pause on a since-abandoned source can't linger and suppress
  // the hint for a completely different (and possibly genuinely stuck) one.
  const [isPaused, setIsPaused] = useState(false);
  useEffect(() => setIsPaused(false), [winnerId]);

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
  // itself changes (a fresh pick deserves a fresh chance before nagging) —
  // and, for the HLS player, whenever it's genuinely paused: someone who hit
  // pause to read the synopsis isn't "stuck", so the hint has no business
  // interrupting them.
  const [showStuckHint, setShowStuckHint] = useState(false);
  useEffect(() => {
    if (winnerId == null || alternatives.length === 0 || isPaused) {
      setShowStuckHint(false);
      return;
    }
    const timer = setTimeout(() => setShowStuckHint(true), 45_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId, data.sources.length, isPaused]);

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
        {/* On a phone the bar has room for the episode control and the escape
            hatch, and nothing else — the source name and its two badges are
            reference detail, not something you act on mid-episode. */}
        <span className="hidden min-w-0 truncate font-medium sm:inline">
          {displaySource.title}
        </span>
        <span className="hidden shrink-0 items-center gap-2 sm:inline-flex">
          <SourceKindBadge source={displaySource} />
          <StabilityMark stable={displaySource.stable} />
        </span>
        {searching && (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <Loader2Icon className="size-3 animate-spin" />
            {t("watch.findingSource")}
          </span>
        )}
        {/* Not colored up front — a quiet, inviting chip rather than a
            statement of fact, so it reads as "click me if this is stuck"
            rather than an error the viewer has no use for. When the stuck
            hint actually has something to say, the icon picks up a gentle
            pulse — the one moment it's fair to draw the eye — and its own
            popover opens right here instead of a screen-center dialog. */}
        {alternatives.length > 0 && (
          <Popover open={showStuckHint} onOpenChange={setShowStuckHint}>
            <PopoverAnchor asChild>
              <button
                type="button"
                onClick={() => {
                  setShowAll((v) => !v);
                  setShowStuckHint(false);
                }}
                className={cn(
                  "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:px-2.5 sm:py-1",
                  showAll
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 bg-secondary/40 text-foreground/80 hover:border-primary/40 hover:bg-secondary/70 hover:text-primary",
                )}
              >
                <ShuffleIcon
                  className={cn(
                    "size-3.5",
                    showStuckHint && !showAll && "animate-pulse text-primary",
                  )}
                />
                {showAll ? t("common.cancel") : t("watch.notWorking")}
              </button>
            </PopoverAnchor>
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={8}
              className="w-72 p-3.5 text-sm"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <p className="font-medium">{t("watch.stuckModalTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("watch.stuckModalBody")}
              </p>
              {/* Stacked, not side-by-side — two buttons with real labels
                  ("Переключить источник" plus an icon, next to "Всё
                  хорошо") never actually fit next to each other in a
                  popover this narrow; they just overflowed its edge. A
                  full-width primary action with the dismiss as a plain
                  link below it fits regardless of label length. */}
              <div className="mt-3 flex flex-col gap-2">
                <Button size="sm" onClick={switchNow} className="w-full">
                  <ShuffleIcon />
                  {t("watch.stuckModalSwitch")}
                </Button>
                <button
                  type="button"
                  onClick={() => setShowStuckHint(false)}
                  className="self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("watch.stuckModalDismiss")}
                </button>
              </div>
            </PopoverContent>
          </Popover>
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
              <CustomHlsPlayer
                key={source.id}
                src={url}
                isWinner={isWinner}
                onReady={() => handleLoad(id)}
                onPlayingChange={(playing) => setIsPaused(!playing)}
              />
            );
          }

          return (
            <iframe
              key={source.id}
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
