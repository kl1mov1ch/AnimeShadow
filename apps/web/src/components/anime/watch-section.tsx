import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import type { StudioId } from "@animeshadow/shared";
import { PartySetupDialog } from "@/components/party/party-setup-dialog";
import { LoadingMessage } from "@/components/player/loading-message";
import { useAddMoment } from "@/lib/moments";
import {
  Volume2Icon,
  UsersIcon,
  PaletteIcon,
  BookmarkPlusIcon,
  FastForwardIcon,
  HistoryIcon,
  ListEndIcon,
  Loader2Icon,
  LockIcon,
  Maximize2Icon,
  Minimize2Icon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Settings2Icon,
  SkipForwardIcon,
  SignalIcon,
  VolumeXIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useWatchSession } from "@/hooks/use-watch-session";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { isKodikUrl, useKodikBridge } from "@/lib/kodik-bridge";
import { type PlayerPrefs, usePlayerPrefs } from "@/lib/player-prefs";
import { dubName, hasEpisode, nativeVariantsFromMaster, resumePosition, sourcesForEpisode } from "@/lib/playback-sources";
import { persistPlayerSettings, pictureFilter, setPlayerSetting, speedLabel, usePlayerSettings } from "@/lib/player-settings";
import { useNavigate } from "react-router-dom";
import { useAnimeProgress, useUpdateProgress, useWatchSources } from "@/lib/query";
import { markLocalEpisode, mergeProgress, recordLocalProgress, useLocalProgress } from "@/lib/local-progress";
import { type EpisodeCatalog, episodesOf, formatClock, useEpisodeCatalog } from "@/lib/episodes";
import { PicturePanel, PlayerSettingsMenu, type QualityChoice, type SettingsPage } from "@/components/anime/player-settings-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDismiss } from "@/hooks/use-dismiss";
import { PlayerSidePanel } from "@/components/anime/player-side-panel";
import { MorphIcon } from "@/components/ui/morph-icon";
import { attachEngine, type EngineHandle, type EngineStatus, type EngineTracks, loadHls, slowLine, warmHls } from "@/components/player/hls-engine";
import { EMPTY_TRACKS, observeNativeTracks, pickNativeTrack, readNativeTracks } from "@/components/player/native-tracks";
import { useMediaSession } from "@/components/player/use-media-session";
import { FramePreview } from "@/components/player/frame-preview";
import { watchMediaResponse, STREAM_START_MS } from "@/components/player/response-watchdog";
import { SkipButton, VolumeControl } from "@/components/player/player-controls";
import { formatTime, SeekBar } from "@/components/player/seek-bar";
import { NetStats } from "@/components/player/net-stats";
import { MemberFeature } from "@/components/player/member-feature";
import { SkipSegmentButton } from "@/components/player/skip-segment-button";
import { type JumpDetail, publishClock, readPlayerClock } from "@/lib/player-clock";
import type { CommentMark } from "@animeshadow/shared";
import { fitSegments, SEGMENT_LABEL, segmentAt, type SkipSegment } from "@/lib/skip-times";
import type { SkipSegmentRaw } from "@animeshadow/shared";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VideoUpscaler } from "@/components/player/video-upscaler";
import { effectiveQuality, qualityHeights, qualityLevel, qualityName, qualityOutputHeight } from "@/lib/player-quality";
import { useIsPro } from "@/components/promo/promo-offer";

interface WatchSectionProps {
  studio?: StudioId;
  /** Constrain a contextual preview without changing normal title playback. */
  sourceFilter?: (source: WatchSource) => boolean;
  directOnly?: boolean;
  trackProgress?: boolean;
  anime: Pick<
    AnimeDetail,
    // The image fields are for the facade shown before the player loads;
    // `duration` is what lets an episode tick itself off as watched.
    | "id"
    | "airing"
    | "airedFrom"
    | "episodes"
    | "duration"
    | "screenshots"
    | "bannerImage"
    | "imageLargeUrl"
    | "imageUrl"
  >;
  title: string;
  active: boolean;
  /** Which episode is loaded — lifted up so a separate Episodes section can jump the player. */
  episode: number;
  onEpisodeChange: (episode: number) => void;
  /**
   * Told when the viewer actually starts the player. The page uses it to
   * keep a way back to the player in view once it is running, since the
   * panel it lives on can be tabbed away from while an episode plays.
   */
  onActivate?: () => void;
  /** Opened from a moment's link: this episode, from this second. */
  startAt?: { episode: number; seconds: number } | null;
}

/** Direct HLS playback for Kodik, AniLibria and configured providers. */
const OWN_PLAYER_ENABLED = true;

export function WatchSection({
  anime,
  title,
  active,
  episode,
  onEpisodeChange,
  onActivate,
  startAt = null,
  sourceFilter,
  directOnly = false,
  trackProgress = true,
  studio,
}: WatchSectionProps) {
  // Prepare our video on entry; sound and playback require one user action.
  const [activated, setActivated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preferOwn, setPreferOwn] = useState(() => {
    try { return localStorage.getItem("as:player-mode") !== "kodik"; } catch { return true; }
  });
  const [switchStart, setSwitchStart] = useState<{ episode: number; seconds: number } | null>(null);
  // Same route, different title: the component is reused, so the choice to
  // load a player on one page must not carry over to the next.
  useEffect(() => {
    setActivated(false);
    setSwitchStart(null);
  }, [anime.id]);
  const releaseDate = anime.airedFrom ? new Date(anime.airedFrom) : null;
  const notYetOut =
    anime.airing === "UPCOMING" &&
    releaseDate != null &&
    releaseDate.getTime() > Date.now();

  const { data: rawData, isPending, refreshSources } = useWatchSources(anime.id, active && !notYetOut);

  // The API exposes direct sources only; every dub uses the same controls.
  const scopedSources = sourceFilter ? rawData?.sources.filter(sourceFilter) : rawData?.sources;
  const ownSources = OWN_PLAYER_ENABLED ? (scopedSources?.filter((s) => s.format === "hls" || s.format === "mp4") ?? []) : [];
  const providerSources: WatchSource[] = (directOnly ? [] : scopedSources ?? []).filter((s) => s.providerPlayer && isKodikUrl(s.providerPlayer.url)).map((s) => ({
    ...s, format: "iframe", embedUrl: s.providerPlayer!.url,
    iframeEpisodes: Object.fromEntries(Object.entries(s.providerPlayer!.episodes).map(([n, url]) => [n, { url, thumbs: [] }])),
    hlsEpisodes: undefined, hlsVariants: undefined,
  }));
  // Our player's streaming code, fetched while the visitor reads the page —
  // not after "play" is pressed.
  const hasOwn = ownSources.length > 0;
  useEffect(() => {
    if (hasOwn) warmHls();
  }, [hasOwn]);
  const canUseOwn = ownSources.length > 0;

  // Where this viewer left off, applied once per visit — and only if they
  // haven't picked an episode themselves in the meantime. It used to live
  // inside Player, which remounts whenever the viewer is moved between our
  // player and the provider's; every remount re-applied the saved episode
  // and threw away whatever had just been clicked, and so did a progress
  // request that simply answered after the click. A choice the viewer made
  // always outranks one we remembered for them.
  const { status: authStatus, user: progressUser } = useAuth();
  const { data: savedProgress } = useAnimeProgress(anime.id, authStatus === "authenticated" && trackProgress, progressUser?.id);
  const progress = trackProgress && authStatus === "authenticated" ? savedProgress : undefined;
  const chosenRef = useRef(false);
  useEffect(() => {
    // A moment's link already chose the episode — saved progress doesn't override it.
    chosenRef.current = startAt != null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.id]);
  useEffect(() => {
    if (chosenRef.current) return;
    if (progress?.resumeEpisode != null) {
      chosenRef.current = true;
      onEpisodeChange(progress.resumeEpisode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.resumeEpisode]);
  const chooseEpisode = (next: number) => {
    chosenRef.current = true;
    onEpisodeChange(next);
  };

  // How many episodes actually exist to play — what the sources can serve,
  // not the planned total the catalogue stores for a show still airing.
  const catalog = useEpisodeCatalog(anime.id, sourceFilter);
  const total = catalog.available ?? anime.episodes ?? 0;

  // An episode past what exists — a stale saved position, a planned-total
  // link, a typed number — is pulled back to the last real one before any
  // player is asked for it, rather than letting the provider's page fall
  // back to some episode of its own choosing and call that "playing".
  useEffect(() => {
    if (catalog.available != null && episode > catalog.available) {
      onEpisodeChange(catalog.available);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.available, episode]);

  // Our player only for episodes our stream actually has. AniLibria can be
  // a few episodes behind Kodik on a show that is airing; asking it for one
  // it doesn't carry would quietly play its first episode instead.
  const ownHasEpisode = ownSources.some((s) => hasEpisode(s, episode));
  const canUseProvider = providerSources.some((s) => hasEpisode(s, episode));
  const useOwn = canUseOwn && ownHasEpisode && (preferOwn || !canUseProvider);

  // A direct stream can be reachable from our server and not from the
  // viewer — AniLibria's CDN is blocked or throttled in some countries, and
  // what that looks like here is a request that never answers rather than
  // one that fails. Falling back to the provider when our side gives up is
  // the difference between "this title doesn't play" and a two-second
  // hiccup nobody notices. Their own click always wins afterwards: this
  // only fires while the preference is still the one we chose for them.
  const data = rawData
    ? { ...rawData, sources: sourcesForEpisode(useOwn ? ownSources : providerSources, episode) }
    : rawData;
  // Warm the TCP/TLS handshake for the top few candidate embeds the moment
  // we know them — that connection setup is otherwise dead time that only
  // starts once the iframe itself is in the DOM.
  usePreconnect(data?.sources);

  if (notYetOut && releaseDate) {
    return <Countdown target={releaseDate} />;
  }

  if ((isPending || (rawData?.sourcesPending && !data?.sources.length)) && active) {
    // The title's own pictures while the sources are found — never a black box.
    return <PlayerShell frames={facadeFrames(anime, catalog, episode)} loading />;
  }

  if (data?.available && data.sources.length > 0) {
    return (
      <Player
        studio={studio}
        trackProgress={trackProgress}
        autoStart={activated}
        onStarted={() => { setActivated(true); onActivate?.(); }}
        poster={facadeFrames(anime, catalog, episode)[0]}
        episodePoster={anime.imageLargeUrl ?? anime.imageUrl}
        // Remounting on the switch is the point: the race, the winner and
        // every player-local bit of state belong to one side or the other,
        // and carrying them across would mean showing the old picture while
        // the new one loads.
        key={`${anime.id}:${useOwn ? "own" : "provider"}`}
        data={data}
        title={title}
        animeId={anime.id}
        episodesTotal={total > 0 ? total : null}
        catalog={catalog}
        runtime={anime.duration}
        episode={episode}
        onEpisodeChange={chooseEpisode}
        onRefreshSources={refreshSources}
        startAt={switchStart ?? startAt}
        useOwn={useOwn}
        canUseOwn={canUseOwn && ownHasEpisode}
        canUseProvider={canUseProvider}
        onUseOwnChange={(next) => {
          const clock = readPlayerClock(anime.id);
          setSwitchStart(clock?.episode === episode ? { episode, seconds: clock.time } : { episode, seconds: 0 });
          setPreferOwn(next);
          try { localStorage.setItem("as:player-mode", next ? "own" : "kodik"); } catch { /* Session only. */ }
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4">
      <Alert><AlertDescription><LoadingMessage failed /></AlertDescription></Alert>
      <p className="text-xs leading-relaxed text-muted-foreground">Проверяем доступные серии у нескольких источников. У анонсов и редких выпусков видео может ещё не быть.</p>
      <Button variant="secondary" className="w-fit" disabled={refreshing} onClick={() => {
        setRefreshing(true);
        void refreshSources().catch(() => toast.error("Источники временно недоступны. Попробуйте позже.")).finally(() => setRefreshing(false));
      }}><RefreshCwIcon className={cn("size-4", refreshing && "animate-spin")} />Проверить источники</Button>
    </div>
  );
}

/**
 * Frames to show before the player is running: this episode's own still
 * first, then the show's screenshots, then the other episodes' stills.
 * Frames, not the key visual — a poster in a 16:9 box is cropped to a
 * strip of someone's face, where a frame is the right shape and is what
 * the viewer is about to watch.
 */
function facadeFrames(
  anime: WatchSectionProps["anime"],
  catalog: EpisodeCatalog,
  episode: number,
): string[] {
  const out: string[] = [];
  const add = (url: string | null | undefined) => {
    if (url && !out.includes(url)) out.push(url);
  };
  add(catalog.info.get(episode)?.thumb);
  for (const shot of anime.screenshots ?? []) add(shot);
  for (const [, info] of catalog.info) {
    if (out.length >= 8) break;
    add(info.thumb);
  }
  if (out.length === 0) add(anime.bannerImage);
  if (out.length === 0) add(anime.imageUrl);
  return out.slice(0, 8);
}

/** How long each frame holds before the next one dissolves in. */
const FACADE_FRAME_MS = 3_800;

/** Without PRO the own player goes up to 720p; 1080p is a PRO thing. */
const FREE_MAX_HEIGHT = 720;
const PROMO_HINT = "Новым аккаунтам — 15 дней PRO бесплатно.";
const minCap = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

/** The frames behind the play button: a phone gets a 640-px copy, not the full shot. */
const FRAME_WIDTH = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? 640 : 1280;

/**
 * The player before it runs, in exactly the player's shape: the picture on
 * the left at 16:9, the episode column on the right, a bar above both. So
 * pressing play — or the sources arriving — changes what is inside the
 * boxes and never the boxes themselves; nothing on the page jumps.
 *
 * While sources load it is a skeleton of that same layout. Once they are
 * in, the frames dissolve one into the next, and the column lists the
 * episodes: choosing one starts the player on it.
 */
function PlayerShell({
  frames,
  loading = false,
  label,
  catalog,
  total = 0,
  episode = 1,
  fallbackDuration = null,
  onActivate,
}: {
  frames: string[];
  loading?: boolean;
  label?: string;
  catalog?: EpisodeCatalog;
  total?: number;
  episode?: number;
  fallbackDuration?: string | null;
  onActivate?: (episode: number | null) => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const usable = frames.filter((f) => !broken.has(f));

  useEffect(() => {
    if (usable.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % usable.length), FACADE_FRAME_MS);
    return () => clearInterval(timer);
  }, [usable.length]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2.5">
      {/* The bar's footprint, so the real one takes the same space. */}
      <div className="h-11 rounded-xl border border-border/60 bg-card/60">
        {loading && <div className="m-2 h-7 w-40 animate-pulse rounded-lg bg-primary/10" />}
      </div>

      <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-stretch">
        <button
          type="button"
          disabled={loading}
          onClick={() => onActivate?.(null)}
          aria-label={label}
          className="group relative -mx-4 block aspect-video overflow-hidden border border-x-0 bg-black sm:mx-0 sm:rounded-xl sm:border-x"
        >
          {/* No picture at all: the site's own backdrop, not an empty black box. */}
          {usable.length === 0 && (
            <span aria-hidden className="absolute inset-0 grid place-items-center bg-[radial-gradient(80%_100%_at_30%_20%,color-mix(in_srgb,var(--primary)_28%,transparent),transparent_65%),radial-gradient(60%_80%_at_85%_80%,color-mix(in_srgb,#a855f7_22%,transparent),transparent_70%)]">
              <span className="font-display text-[9rem] leading-none text-white/[0.06]">影</span>
            </span>
          )}
          {usable.map((frame, i) => (
            <img
              key={frame}
              src={imageSrc(frame, FRAME_WIDTH)}
              alt=""
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={() => setBroken((b) => new Set(b).add(frame))}
              className={cn(
                "absolute inset-0 size-full object-cover transition-opacity duration-1000",
                i === index % Math.max(1, usable.length)
                  ? "home-kenburns opacity-80 group-hover:opacity-95"
                  : "opacity-0",
              )}
            />
          ))}
          {loading ? (
            <span className="absolute inset-0 bg-gradient-to-br from-primary/25 via-primary/5 to-transparent" />
          ) : (
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/10" />
          )}
          <span className="relative flex size-full flex-col items-center justify-center gap-3">
            {loading ? (
              <>
                <Loader2Icon className="size-8 animate-spin text-primary" />
                <span className="text-xs font-medium text-white/80">{t("watch.findingSource")}</span>
              </>
            ) : (
              <>
                <span className="relative grid size-16 place-items-center">
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-duration:2.4s] motion-reduce:hidden"
                  />
                  <span className="relative grid size-16 place-items-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-2xl transition-transform duration-300 group-hover:scale-110">
                    <PlayIcon className="size-7 translate-x-[2px] fill-current" />
                  </span>
                </span>
                <span className="rounded-lg border border-primary/30 bg-black/70 px-3 py-1 text-sm font-medium text-white">
                  {label}
                </span>
              </>
            )}
          </span>
          {usable.length > 1 && !loading && (
            <span className="absolute inset-x-0 bottom-3 flex justify-center gap-1">
              {usable.map((frame, i) => (
                <span
                  key={frame}
                  className={cn(
                    "h-1 rounded-full transition-all duration-500",
                    i === index % usable.length ? "w-5 bg-primary" : "w-1.5 bg-white/40",
                  )}
                />
              ))}
            </span>
          )}
        </button>

        {/* The list's own height never sets the row's: on a wide screen it
            is pinned to the cell the video sizes, so the picture always keeps
            its whole column. */}
        <div className="relative min-w-0">
        <aside className="flex max-h-[22rem] min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-card/40 lg:absolute lg:inset-0 lg:max-h-none">
          <div className="flex shrink-0 gap-1 border-b border-border/60 p-1">
            <span className="h-7 flex-1 rounded-lg bg-primary/15" />
            <span className="h-7 flex-1 rounded-lg bg-primary/5" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading || !catalog || total <= 0
              ? Array.from({ length: 7 }, (_, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${i * 80}ms` }}
                    className="flex h-11 shrink-0 animate-pulse items-center gap-2 rounded-lg p-1"
                  >
                    <span className="aspect-video h-full rounded-md bg-primary/15" />
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="h-2.5 w-3/4 rounded bg-primary/15" />
                      <span className="h-2 w-1/3 rounded bg-primary/10" />
                    </span>
                  </span>
                ))
              : Array.from({ length: total }, (_, i) => i + 1).map((n) => {
                  const info = catalog.info.get(n);
                  const length =
                    info?.durationSeconds != null
                      ? formatClock(info.durationSeconds)
                      : fallbackDuration;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onActivate?.(n)}
                      className={cn(
                        "group/ep flex shrink-0 items-center gap-2 rounded-lg border p-1 pr-2 text-left transition-colors duration-200",
                        n === episode
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:border-primary/40 hover:bg-secondary/40",
                      )}
                    >
                      <span className="relative aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-secondary/60">
                        {info?.thumb ? (
                          <img
                            src={imageSrc(info.thumb, 240)}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover transition-transform duration-500 group-hover/ep:scale-110"
                          />
                        ) : (
                          <span className="grid size-full place-items-center font-display text-xs text-muted-foreground">
                            {n}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-medium leading-tight">
                          {info?.title ? `${n}. ${info.title}` : t("detail.episodeNumber", { n })}
                        </span>
                        {length && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">{length}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
          </div>
        </aside>
        </div>
      </div>
    </div>
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
 * Minutes of runtime out of the string the catalogue stores ("24 мин.").
 *
 * It is a per-title average, not this episode's real length, so everything
 * built on it has to be a threshold rather than a measurement.
 */
function runtimeMinutes(duration: string | null): number | null {
  if (!duration) return null;
  const match = /\d+/.exec(duration);
  const minutes = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * How much of an episode counts as having watched it. Short of the end on
 * purpose: credits, and the fact that the runtime here is a title-wide
 * average that individual episodes miss in both directions.
 */
/** Watched this much of an episode — it counts as seen. */
const COMPLETE_AT = 0.75;

/**
 * Save the signed-in viewer's actual media position, including seeks and pauses.
 * Flush on hide, unmount and episode change; never measure time spent on a page.
 */
function useEpisodeTracking({ animeId, episode, seedPosition, active, runtime, alreadyDone, readClock }: {
  animeId: number; episode: number; seedPosition: number; active: boolean;
  runtime: string | null; alreadyDone: boolean;
  readClock: () => { position: number; duration: number };
}): void {
  const t = useT();
  const { status, user } = useAuth();
  const authed = status === "authenticated";
  const update = useUpdateProgress(animeId, user?.id);
  const clockRef = useRef(readClock);
  clockRef.current = readClock;
  const ownerRef = useRef(user?.id);
  ownerRef.current = user?.id;
  const lastSent = useRef(seedPosition);
  const doneRef = useRef(alreadyDone);
  useEffect(() => { doneRef.current = alreadyDone; }, [episode, alreadyDone, user?.id]);
  useEffect(() => { lastSent.current = seedPosition; }, [episode, seedPosition, user?.id]);
  useEffect(() => {
    const owner = user?.id;
    if (!authed || !active || !owner) return;
    const flush = () => {
      if (ownerRef.current !== owner) return;
      const clock = clockRef.current();
      if (!Number.isFinite(clock.position) || clock.position <= 0) return;
      const position = Math.min(200_000, Math.floor(clock.position));
      if (position === lastSent.current) return;
      const duration = Number.isFinite(clock.duration) && clock.duration > 0
        ? Math.min(200_000, Math.round(clock.duration)) : (runtimeMinutes(runtime) ?? 0) * 60;
      const justFinished = !doneRef.current && duration > 0 && position / duration >= COMPLETE_AT;
      const completed = doneRef.current || justFinished;
      if (justFinished) doneRef.current = true;
      lastSent.current = position;
      update.mutate({ episode, positionSeconds: position, ...(duration > 0 ? { durationSeconds: duration } : {}), completed },
        justFinished ? { onSuccess: () => toast.success(t("watch.autoMarked", { n: episode })) } : undefined);
    };
    // The list on screen moves from this device's own record (local-progress);
    // the server only needs a save every half minute.
    const timer = window.setInterval(flush, 30_000);
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", flush);
    };
    // The clock is read from a ref so ordinary playback does not restart the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, active, animeId, episode, runtime, user?.id]);
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
    <div className="flex w-full flex-col items-center gap-4 rounded-xl border bg-card/60 p-4 text-center sm:p-8">
      <p className="text-sm font-medium text-primary">{t("watch.comingOn", { date: dateLabel })}</p>
      {/* Four equal cells that never outgrow the card: a three- or four-digit day count gets smaller digits. */}
      <div className="grid w-full max-w-md grid-cols-4 gap-1.5 sm:gap-3">
        {[
          [days, t("watch.days")],
          [hours, t("watch.hours")],
          [minutes, t("watch.minutes")],
          [seconds, t("watch.seconds")],
        ].map(([value, unit], i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col items-center rounded-lg bg-secondary/60 px-1 py-2 sm:px-3"
          >
            <span
              className={cn(
                "max-w-full font-display leading-none tabular-nums",
                String(value).length >= 4 ? "text-lg sm:text-2xl" : String(value).length === 3 ? "text-xl sm:text-3xl" : "text-2xl sm:text-3xl",
              )}
            >
              {String(value).padStart(2, "0")}
            </span>
            <span className="mt-1 max-w-full truncate text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
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

/** If the embed page hasn't loaded by now, assume it's dead. A Kodik page
 * is megabytes of its own scripts: three seconds was not enough on a phone,
 * and a page that was about to work got replaced by the next one. */
const STALL_MS = 12_000;
/** Later batches get less patience — we're already in "keep hunting" mode. */
const STALL_MS_RETRY = 8_000;



/**
 * How many candidate embeds load at once. One: a Kodik page is megabytes
 * of its own scripts, and loading two to keep the faster one halved the
 * bandwidth each got — on an ordinary connection that made *both* slow.
 * A dead one is still caught by the stall timer and the next one tried.
 */
const RACE_SIZE = 1;

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

/** Two providers can carry the exact same dub — same studio, same name —
 * and there's no reason to make the viewer choose between two entries that
 * read identically. Keeps the first occurrence of each (title, kind) pair,
 * which is also the better-ranked one: the list arrives sorted best-first
 * from the server, so whichever copy shows up first is the one worth
 * keeping. */
function dedupeSources(sources: WatchSource[]): WatchSource[] {
  const seen = new Set<string>();
  const deduped: WatchSource[] = [];
  for (const source of sources) {
    // The same studio on two hosts is still two useful fallback sources.
    const key = source.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
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
function initialRacePool(sources: WatchSource[], favourite?: string | null): string[] {
  const viable = viableSources(sources);
  // A dub someone went out of their way to mark is worth more than our
  // ranking: they told us what they want, and loading it alone is both
  // what they asked for and cheaper than racing anything against it.
  if (favourite) {
    const chosen = viable.find((s) => s.title === favourite);
    if (chosen) return [chosen.id];
  }
  const top = viable[0];
  const trustAlone = top != null && (top.stable === true || top.format === "hls");
  return viable.slice(0, trustAlone ? 1 : RACE_SIZE).map((s) => s.id);
}

/**
 * The URL to actually load right now.
 *
 * Both formats are per-episode, for different reasons. An HLS source has a
 * manifest per episode outright. An iframe source has one embed page for
 * the whole series *plus*, when the provider publishes them, a page per
 * episode — using those is what lets our own episode buttons drive the
 * player instead of the provider's controls inside the frame, entirely
 * through URLs the provider hands out for that purpose.
 *
 * A missing direct episode never falls back to a different episode.
 */
function sourceUrlFor(source: WatchSource, episode: number): string | null {
  if (source.format === "hls" || source.format === "mp4") {
    const url = (source.hlsEpisodes ?? source.mediaEpisodes)?.[String(episode)] ?? null;
    const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
    return url?.startsWith("/api/") && apiBase ? `${apiBase}${url}` : url;
  }
  return withEmbedOptions(source.iframeEpisodes?.[String(episode)]?.url ?? source.embedUrl);
}

/**
 * Kodik's own embed options that hide its season/episode and dub pickers.
 *
 * Episodes and dubs are chosen in our panel beside the player, so the same
 * controls inside the frame are a second, disconnected way to do it — pick
 * a dub in there and our panel no longer says what is playing. These are
 * parameters Kodik documents for embedding sites; they change what its
 * page shows and nothing else, and leave its player, its ads and its
 * traffic exactly as they were.
 */
function withEmbedOptions(url: string): string {
  try {
    const parsed = new URL(url, window.location.href);
    if (!/(^|\.)kodik/i.test(parsed.hostname)) return url;
    parsed.searchParams.set("hide_selectors", "true");
    parsed.searchParams.set("translations", "false");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** How long the control bar stays up after the last interaction once
 * playback is under way — long enough to read the time/title, short
 * enough to get out of the way of the actual video. */
/** Below this, "where you left off" is just the opening credits again. */
const RESUME_MIN_SECONDS = 30;
/** And this close to the end, the viewer wants the next episode, not a seek. */

/**
 * The shape of every square button in the control bar. Only what all three
 * skins agree on — the colour half comes from the skin, because over a
 * video colour is the whole of what says this player is ours and not the
 * provider's. `group` is here so an icon inside can react to the hover.
 */
const CONTROL_BUTTON =
  "group flex size-8 items-center justify-center rounded-lg transition-all duration-200 active:scale-90";

/** The round buttons in the middle of the picture: skip back, play, skip on. */
const CENTER_BUTTON =
  "relative grid place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/10 transition-[transform,background-color] duration-200 active:scale-90";

/**
 * Controls that have just appeared under a finger don't take that same tap:
 * a phone sends the click after the tap that showed them, and it landed on
 * whatever button had appeared there — pausing the episode, say.
 */
const FRESH_CONTROLS_MS = 350;

const CONTROLS_HIDE_MS = 2600;

/**
 * Peak bitrates for the master playlist we build over a provider's separate
 * quality streams — measured on AniLibria's (≈0.75 / 1.5 Mbit/s for 480p and
 * 720p), with headroom, since hls.js reads BANDWIDTH as a peak.
 */
const LEVEL_BANDWIDTH: Record<number, number> = { 480: 1_000_000, 720: 2_000_000, 1080: 4_000_000 };

/**
 * One master playlist over streams the provider publishes separately, one
 * per quality: hls.js can then switch between them by itself (auto) or on
 * request, exactly as with a master the provider had written.
 */
function masterPlaylist(variants: Record<string, string>, heights: number[]): string {
  const lines = ["#EXTM3U"];
  for (const height of heights) {
    const width = Math.round((height * 16) / 9 / 2) * 2;
    const bandwidth = LEVEL_BANDWIDTH[height] ?? Math.round(height * height * 3.5);
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height}`, variants[String(height)]!);
  }
  return `${lines.join("\n")}\n`;
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
export function CustomHlsPlayer({
  src,
  format = "hls",
  mediaTitle = "AnimeShadow",
  onRefreshSource,
  variants = null,
  skin,
  isWinner,
  onReady,
  onFailed,
  resumeFrom = 0,
  resumeExact = false,
  onEnded,
  opening = null,
  segments = [],
  autoSkip = { op: false, ed: false },
  onNearEnd,
  marks = [],
  onUserAction,
  onBuffering,
  onNet,
  onAhead,
  onTime,
  autoStart = true,
  onStarted,
  onPlaybackChange,
  poster,
}: {
  src: string;
  format?: "hls" | "mp4";
  autoStart?: boolean;
  onStarted?: () => void;
  onPlaybackChange?: (playing: boolean) => void;
  poster?: string | undefined;
  mediaTitle?: string;
  onRefreshSource?: () => Promise<unknown>;
  /** Preserve a position selected during this visit, including the first/last minute. */
  resumeExact?: boolean;
  /** This episode in every quality the provider publishes ("480" → manifest, …). */
  variants?: Record<string, string> | null;
  /** Which of the site's three looks the control bar wears. */
  skin: PlayerSkin;
  isWinner: boolean;
  onReady: () => void;
  /** This stream cannot play here — hls.js itself failed to load, or gave up
   * on the manifest. Lets the race retire this source at once instead of
   * sitting out the full stall timeout waiting for a signal that is never
   * coming. */
  onFailed: () => void;
  /**
   * Seconds this viewer had reached in this episode, from their own saved
   * progress. Applied once per stream, and only when it is far enough from
   * either end to be worth restoring.
   */
  resumeFrom?: number;
  /** The stream ran to its end — the page decides what happens next. */
  onEnded?: () => void;
  /** Where this episode's opening sits, when the provider marked it. */
  opening?: { start: number; stop: number } | null;
  /** AniSkip's marks for this episode (all lengths); fitted to this copy here. */
  segments?: SkipSegmentRaw[];
  /** The viewer's "skip the opening / ending" switches. */
  autoSkip?: { op: boolean; ed: boolean };
  /**
   * Near the end with the rest of the episode already loaded (or under 45 s
   * left): the next episode can start loading without taking the line from
   * this one. Called once per episode.
   */
  onNearEnd?: () => void;
  /** Comments tied to moments of this episode: marks on the bar, popping up as playback passes them. */
  marks?: CommentMark[];
  /**
   * Watching together: what the viewer did (play, pause, a seek), so the
   * room can follow. Commands from the room (window event "as:player-cmd")
   * are applied without being reported back.
   */
  onUserAction?: (action: { type: "play" | "pause" | "seek"; time: number }) => void;
  /** Short of data / playing again — a room waits for its slowest member. */
  onBuffering?: (buffering: boolean) => void;
  /** The line's measured speed, Mbit/s, every few seconds. */
  onNet?: (mbps: number | null) => void;
  /** Seconds loaded past the playhead, every couple of seconds. */
  onAhead?: (seconds: number) => void;
  /** Where playback is, and how long the episode runs. */
  onTime?: (time: number, duration: number) => void;
}) {
  const t = useT();
  const tone = SKINS[skin];
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playRequestedRef = useRef(autoStart);
  const onStartedRef = useRef(onStarted);
  const onPlaybackChangeRef = useRef(onPlaybackChange);
  onPlaybackChangeRef.current = onPlaybackChange;
  onStartedRef.current = onStarted;
  useEffect(() => { playRequestedRef.current = autoStart; }, [autoStart]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read from the src-loading effect below without re-running it on every
  // isWinner flip — it only needs to know, at the moment a *new episode's*
  // manifest finishes loading, whether to resume playback automatically.
  const isWinnerRef = useRef(isWinner);
  useEffect(() => {
    isWinnerRef.current = isWinner;
  }, [isWinner]);

  // Same reason as isWinnerRef: reachable from the src-loading effect without
  // making that effect depend on a callback identity.
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // The seek is applied once per stream, not once per metadata event: a
  // browser can fire loadedmetadata again after a stall, and dragging the
  // viewer back to where they *were* an hour ago would be worse than never
  // restoring anything.
  const resumeRef = useRef(resumeFrom);
  const exactResumeRef = useRef(resumeExact);
  useEffect(() => {
    resumeRef.current = resumeFrom;
    exactResumeRef.current = resumeExact;
  }, [resumeFrom, resumeExact]);
  const resumedSrcRef = useRef<string | null>(null);
  useEffect(() => {
    resumedSrcRef.current = null;
  }, [src]);

  // "Ready" is said once per load: canplay fires again after every seek, and
  // a watch-together room answered each one with another seek — a loop.
  const readySentRef = useRef<string | null>(null);
  const applyResume = () => {
    const video = videoRef.current;
    const loadId = `${src}#${reloadKey}`;
    if (video && readySentRef.current !== loadId && (video.readyState >= 2 || format === "mp4" || video.canPlayType("application/vnd.apple.mpegurl"))) {
      readySentRef.current = loadId;
      onReady();
    }
    const at = resumeRef.current;
    if (!video || resumedSrcRef.current === src) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    resumedSrcRef.current = src;
    const position = resumePosition(at, duration, exactResumeRef.current);
    if (position != null) {
      if (Math.abs(video.currentTime - position) > 0.5) video.currentTime = position;
    } else if (video.currentTime > 1) {
      video.currentTime = 0;
    }
  };

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<Array<[number, number]>>([]);
  // The browser refused to start with sound (no recent click): playing muted,
  // with a button to bring the sound in.
  const [autoMuted, setAutoMuted] = useState(false);
  // Until when the player's own play/pause/seek events are the page's doing, not the viewer's.
  const suppressUntilRef = useRef(0);
  const startPlayback = (video: HTMLVideoElement) => {
    playRequestedRef.current = true;
    engineRef.current?.setPreloadOnly(false);
    // Started by the page, not the viewer: not reported to a watch-together room.
    suppressUntilRef.current = performance.now() + 2000;
    video.muted = false;
    void video.play().catch((error: unknown) => {
      if ((error as { name?: string })?.name !== "NotAllowedError") return;
      video.muted = true;
      void video
        .play()
        .then(() => setAutoMuted(true))
        .catch(() => undefined);
    });
  };
  // What the stream is doing: loading, retrying after a drop, fine, given up.
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  // Bumped by "Повторить": loads the same stream again from where it stopped.
  const [reloadKey, setReloadKey] = useState(0);
  // Preserve the exact position when this stream is replaced or reloaded.
  const playedRef = useRef(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Which list of the settings panel is open, if it is.
  const [menu, setMenu] = useState<SettingsPage | null>(null);
  const menuOpen = menu != null;
  const savedSettings = usePlayerSettings();
  const { status: memberStatus } = useAuth();
  const member = memberStatus === "authenticated";
  const settings = member ? savedSettings : { ...savedSettings, speed: 1, step: 10 };
  const closeMenu = useCallback(() => setMenu(null), []);
  // A press outside the player closes the panel; inside, its backdrop does.
  useDismiss(menuOpen, closeMenu, containerRef);
  // Read from effects and key handlers without re-running them.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const nativeVariantsRef = useRef<Record<string, string> | null>(null);
  const variantsRef = useRef(variants);
  variantsRef.current = variants ?? nativeVariantsRef.current;
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;

  // Quality: the heights on offer, and the one actually on screen (with
  // "auto", hls.js moves between them as the connection allows).
  const engineRef = useRef<EngineHandle | null>(null);
  const [tracks, setTracks] = useState<EngineTracks>(EMPTY_TRACKS);
  useMediaSession(videoRef, isWinner, mediaTitle);
  const pickTrack = (kind: "audio" | "subtitles", id: number) => {
    const engine = engineRef.current;
    if (engine) {
      if (kind === "audio") engine.setAudioTrack(id);
      else engine.setSubtitleTrack(id);
    } else if (videoRef.current) {
      pickNativeTrack(videoRef.current, kind, id);
      setTracks(readNativeTracks(videoRef.current));
    }
  };
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    return observeNativeTracks(video, () => {
      if (!engineRef.current) setTracks(readNativeTracks(video));
    });
  }, []);
  const [levels, setLevels] = useState<number[]>([]);
  const pro = useIsPro();
  const limitRef = useRef<number | null>(null);
  limitRef.current = pro ? null : FREE_MAX_HEIGHT;
  // PRO started (or ran out) while the player was open.
  useEffect(() => {
    engineRef.current?.capHeight(pro ? null : FREE_MAX_HEIGHT);
  }, [pro]);
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  // The picture's own height, for a stream that comes in one quality only.
  const [videoHeight, setVideoHeight] = useState(0);
  const responseRef = useRef<ReturnType<typeof watchMediaResponse> | null>(null);
  // A stream that already played and then stood still for long is reloaded
  // in place — same dub, same second — twice at most; only then is it handed
  // back to the page as failed. Switching dubs over a slow line restarted the
  // episode from nothing and was the "it keeps reloading" people saw.
  const stallReloadsRef = useRef(0);
  useEffect(() => {
    stallReloadsRef.current = 0;
  }, [src]);
  const reloadInPlaceRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const proxied = format === "hls" && /\/(?:streams\/kodik\/|studios\/hon-kon\/(?:clips|uploads)\/)/.test(src);
    const monitor = watchMediaResponse(
      video,
      () => onFailedRef.current(),
      proxied ? 20_000 : STREAM_START_MS,
      () => {
        if (stallReloadsRef.current >= 2) {
          onFailedRef.current();
          return;
        }
        stallReloadsRef.current += 1;
        reloadInPlaceRef.current();
      },
    );
    responseRef.current = monitor;
    return () => {
      monitor.destroy();
      responseRef.current = null;
    };
  }, [src, reloadKey, format]);

  // Load the manifest — native on Safari, hls.js everywhere else. Resumes
  // playback itself if this load was triggered by switching episodes while
  // already the winner (assigning a fresh `src` otherwise leaves autoplay
  // up to the browser, which usually just... doesn't).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: { destroy: () => void } | null = null;
    let master: string | null = null;
    let cancelled = false;
    const nativeRequest = new AbortController();
    setLevels([]);
    setTracks(EMPTY_TRACKS);
    setActiveHeight(null);
    setStatus({ kind: "loading" });
    playedRef.current = false;

    const resumeIfWinner = () => {
      if (isWinnerRef.current && playRequestedRef.current) startPlayback(video);
    };

    const variants = variantsRef.current;
    const heights = Object.keys(variants ?? {})
      .map(Number)
      .filter((h) => Number.isFinite(h) && h > 0)
      .sort((a, b) => a - b);
    // A saved 1080p falls back to "auto" (capped) without PRO.
    const saved = settingsRef.current.quality;
    const wanted = effectiveQuality(saved, limitRef.current == null);

    // Apple's browsers play HLS themselves (and iPhones before iOS 17 can
    // play it no other way): one quality at a time, switched by swapping
    // the stream. Everyone else gets hls.js, which switches by itself.
    const appleNative =
      video.canPlayType("application/vnd.apple.mpegurl") !== "" && /Apple/.test(navigator.vendor);
    if (format === "mp4") {
      video.preload = playRequestedRef.current ? "auto" : "metadata";
      video.src = src;
      video.load();
      resumeIfWinner();
    } else if (appleNative) {
      // Native Safari controls its own segment fetching. Metadata mode
      // avoids an unbounded background download before the user presses play.
      video.preload = playRequestedRef.current ? "auto" : "metadata";
      const startNative = (choices: Record<string, string> | null) => {
        if (cancelled) return;
        nativeVariantsRef.current = choices;
        variantsRef.current = choices;
        const available = Object.keys(choices ?? {}).map(Number).filter((height) => height > 0).sort((a, b) => a - b);
        const capped = limitRef.current ? available.filter((height) => height <= limitRef.current!) : available;
        const top = capped[capped.length - 1];
        const picked = wanted === "auto" ? top : available[qualityLevel(available, wanted)];
        video.src = (picked != null ? choices?.[String(picked)] : undefined) || src;
        if (available.length > 1) setLevels(available);
        setActiveHeight(picked ?? null);
        resumeIfWinner();
      };
      if (new URL(src, location.href).pathname.includes("/streams/kodik/")) {
        void fetch(src, { signal: nativeRequest.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("Manifest unavailable");
            return nativeVariantsFromMaster(await response.text(), response.url);
          })
          .then(startNative)
          .catch(() => { if (!cancelled) startNative(null); });
      } else startNative(variants);
    } else {
      // The full build supports alternate audio and subtitles published
      // in a provider's master playlist; it is still loaded lazily.
      void loadHls()
        .then((Hls) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            // No native support and hls.js can't help either — set it
            // anyway; a handful of very old browsers still get lucky.
            video.src = src;
            resumeIfWinner();
            return;
          }
          if (variants && heights.length > 1) {
            master = URL.createObjectURL(
              new Blob([masterPlaylist(variants, heights)], { type: "application/vnd.apple.mpegurl" }),
            );
          }
          const resumeAt = resumeRef.current;
          const engine = attachEngine(Hls, video, master ?? src, {
            preloadOnly: !playRequestedRef.current,
            startPosition: exactResumeRef.current || resumeAt >= RESUME_MIN_SECONDS ? resumeAt : -1,
            startLevel: (parsed) => qualityLevel(parsed, wanted),
            onLevels: (parsed) => {
              if (parsed.length > 1) setLevels(parsed);
              if (limitRef.current) engineRef.current?.capHeight(limitRef.current);
            },
            onLevelSwitched: setActiveHeight,
            // "Ready" for the race: the manifest is parsed, so this source
            // is real and answering — not after the first (slow) segment.
            onManifest: () => {
              resumeIfWinner();
            },
            onStatus: setStatus,
            onResponse: () => responseRef.current?.progress(),
            onTracks: setTracks,
            onFatal: () => {
              onFailedRef.current();
            },
          });
          engineRef.current = engine;
          hls = engine;
        })
        .catch((error: unknown) => {
          // The chunk never arrived (offline, a stale cached page pointing at
          // a file the last deploy replaced, an extension blocking it).
          console.error("[AnimeShadow] hls.js failed to load", error);
          if (cancelled) return;
          setStatus({ kind: "failed", reason: "hls.js" });
          onFailedRef.current();
        });
    }

    return () => {
      cancelled = true;
      nativeRequest.abort();
      if (playedRef.current && Number.isFinite(video.currentTime)) {
        resumeRef.current = video.currentTime;
        exactResumeRef.current = true;
      }
      hls?.destroy();
      engineRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (master) URL.revokeObjectURL(master);
    };
  }, [src, reloadKey, format]);

  // Frames for the seek bar's preview: the lowest quality is plenty for a
  // picture the size of a stamp, and the cheapest to fetch.
  const previewSrc = useMemo(() => {
    const lowest = Object.keys(variants ?? {})
      .map(Number)
      .filter((h) => h > 0)
      .sort((a, b) => a - b)[0];
    return (lowest != null ? variants?.[String(lowest)] : null) ?? src;
  }, [variants, src]);
  const bufferingRef = useRef(false);
  const [preview, setPreview] = useState<FramePreview | null>(null);
  useEffect(() => {
    if (!isWinner) return;
    // The preview never takes the line from the episode: it waits while the
    // main picture is short of data.
    // On a slow line the preview uses only frames already played — it never fetches.
    const next = new FramePreview(slowLine() ? null : previewSrc, () => {
      const video = videoRef.current;
      return bufferingRef.current || !video || video.readyState < 3;
    }, format);
    const video = videoRef.current;
    if (video) next.capture(video);
    setPreview(next);
    return () => {
      next.destroy();
      setPreview(null);
    };
  }, [previewSrc, isWinner, format]);
  const previewRef = useRef(preview);
  previewRef.current = preview;

  // The connection card: the line's speed every two seconds (the last half
  // minute kept), seconds loaded ahead. Closed by the viewer, it stays closed.
  const [netHidden, setNetHidden] = useState(() => {
    try {
      return localStorage.getItem("as:net-stats") === "hidden";
    } catch {
      return false;
    }
  });
  const toggleNet = (hide: boolean) => {
    setNetHidden(hide);
    try {
      localStorage.setItem("as:net-stats", hide ? "hidden" : "shown");
    } catch {
      // Fine — just for this visit.
    }
  };
  const [netHistory, setNetHistory] = useState<number[]>([]);
  const onNearEndRef = useRef(onNearEnd);
  const onNetRef = useRef(onNet);
  const onAheadRef = useRef(onAhead);
  onAheadRef.current = onAhead;
  onNetRef.current = onNet;
  const onBufferingRef = useRef(onBuffering);
  onBufferingRef.current = onBuffering;
  useEffect(() => {
    onBufferingRef.current?.(buffering);
  }, [buffering]);
  onNearEndRef.current = onNearEnd;
  const nearEndSentRef = useRef<string | null>(null);
  const [bufferAhead, setBufferAhead] = useState(0);
  useEffect(() => {
    if (!isWinner) return;
    setNetHistory([]);
    const sample = () => {
      const video = videoRef.current;
      if (video) {
        let ahead = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime + 0.5 && video.buffered.end(i) > video.currentTime) {
            ahead = video.buffered.end(i) - video.currentTime;
          }
        }
        setBufferAhead(ahead);
        onAheadRef.current?.(ahead);
        const length = Number.isFinite(video.duration) ? video.duration : 0;
        const left = length - video.currentTime;
        if (length > 0 && left < 150 && (ahead >= left - 2 || left < 45) && nearEndSentRef.current !== src) {
          nearEndSentRef.current = src;
          onNearEndRef.current?.();
        }
      }
      const bw = engineRef.current?.bandwidth() ?? 0;
      if (bw > 0) setNetHistory((h) => [...h.slice(-14), bw / 1_000_000]);
      onNetRef.current?.(bw > 0 ? bw / 1_000_000 : null);
    };
    sample();
    const id = setInterval(sample, onAhead ? 1000 : 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWinner, src, reloadKey]);

  // "Go there" from a comment's moment (Player turns it into this event for us).
  useEffect(() => {
    if (!isWinner) return;
    const onSeek = (e: Event) => {
      const video = videoRef.current;
      const t = (e as CustomEvent<{ seconds: number }>).detail.seconds;
      if (video && Number.isFinite(t)) {
        video.currentTime = t;
        void video.play().catch(() => undefined);
      }
    };
    window.addEventListener("as:player-seek", onSeek);
    return () => window.removeEventListener("as:player-seek", onSeek);
  }, [isWinner]);

  // Watching together: commands from the room, and the viewer's own actions reported to it.
  const roomSeekRef = useRef<number | null>(null);
  const onUserActionRef = useRef(onUserAction);
  onUserActionRef.current = onUserAction;
  useEffect(() => {
    if (!isWinner) return;
    const video = videoRef.current;
    if (!video) return;
    const onCmd = (e: Event) => {
      const d = (e as CustomEvent<{ seconds?: number; play?: boolean; maxHeight?: number | null; rate?: number }>).detail;
      if (d.maxHeight !== undefined) engineRef.current?.capHeight(minCap(d.maxHeight, limitRef.current));
      // A gentle catch-up: a little faster or slower for a few seconds instead of a jump.
      if (d.rate != null && Math.abs(video.playbackRate - d.rate) > 0.001) video.playbackRate = d.rate;
      const seek = d.seconds != null && Math.abs(video.currentTime - d.seconds) > 0.5;
      const play = d.play === true && video.paused;
      const pause = d.play === false && !video.paused;
      if (!seek && !play && !pause) return;
      suppressUntilRef.current = performance.now() + 1500;
      if (seek) {
        // Its "seeked" can come many seconds later on a slow line — long
        // after any time window — and reported back it moved the whole room.
        roomSeekRef.current = d.seconds!;
        video.currentTime = d.seconds!;
      }
      if (play) startPlayback(video);
      if (pause) video.pause();
    };
    const report = (type: "play" | "pause" | "seek") => () => {
      if (type === "seek" && roomSeekRef.current != null) {
        const target = roomSeekRef.current;
        roomSeekRef.current = null;
        if (Math.abs(video.currentTime - target) < 1.5) return;
      }
      if (!onUserActionRef.current || performance.now() < suppressUntilRef.current) return;
      onUserActionRef.current({ type, time: video.currentTime });
    };
    const onPlay = report("play");
    const onPause = report("pause");
    const onSeeked = report("seek");
    window.addEventListener("as:player-cmd", onCmd);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    return () => {
      window.removeEventListener("as:player-cmd", onCmd);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [isWinner, src]);

  // Comments popping up at their moment — at most one at a time, four seconds each; can be turned off.
  const [momentsOn, setMomentsOn] = useState(() => {
    try {
      return localStorage.getItem("as:moment-comments") !== "off";
    } catch {
      return true;
    }
  });
  const [popped, setPopped] = useState<CommentMark | null>(null);
  const shownMarksRef = useRef(new Set<string>());
  useEffect(() => {
    shownMarksRef.current = new Set();
  }, [src]);
  useEffect(() => {
    if (!momentsOn || !isWinner || !playing || marks.length === 0) return;
    const hit = marks.find((m) => currentTime >= m.atSeconds && currentTime < m.atSeconds + 2 && !shownMarksRef.current.has(m.id));
    if (!hit) return;
    shownMarksRef.current.add(hit.id);
    setPopped(hit);
    const timer = setTimeout(() => setPopped((p) => (p?.id === hit.id ? null : p)), 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(currentTime), momentsOn, isWinner, playing]);

  const reload = async () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime)) {
      resumeRef.current = video.currentTime;
      exactResumeRef.current = true;
      resumedSrcRef.current = null;
    }
    setStatus({ kind: "loading" });
    await onRefreshSource?.().catch(() => undefined);
    setReloadKey((k) => k + 1);
  };
  reloadInPlaceRef.current = () => {
    const video = videoRef.current;
    if (video && Number.isFinite(video.currentTime) && video.currentTime > 0) {
      resumeRef.current = video.currentTime;
      exactResumeRef.current = true;
      resumedSrcRef.current = null;
    }
    playRequestedRef.current = true;
    setReloadKey((k) => k + 1);
  };

  // The viewer's speed, kept across episodes: a new stream starts at the
  // default rate, so the default is what gets set.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = settings.speed;
    video.playbackRate = settings.speed;
  }, [settings.speed, src]);

  // Only the winner actually plays and makes sound — every other racer
  // sits muted and paused behind it until it either wins or is dropped.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isWinner && playRequestedRef.current) {
      startPlayback(video);
    } else {
      video.muted = true;
      video.pause();
    }
  }, [isWinner, autoStart]);

  // Native media events -> our own state, so the bar below is drawn from
  // the element's real state instead of guessed at.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      previewRef.current?.capture(video);
      onTimeRef.current?.(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onDurationChange = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onProgress = () => {
      const ranges = video.buffered;
      const out: Array<[number, number]> = [];
      for (let i = 0; i < ranges.length; i++) out.push([ranges.start(i), ranges.end(i)]);
      setBuffered(out);
    };
    const onPlay = () => {
      playRequestedRef.current = true;
      engineRef.current?.setPreloadOnly(false);
      onStartedRef.current?.();
      onPlaybackChangeRef.current?.(true);
      setPlaying(true);
    };
    const onPause = () => { setPlaying(false); onPlaybackChangeRef.current?.(false); };
    const onWaiting = () => {
      bufferingRef.current = true;
      setBuffering(true);
    };
    const onPlaying = () => {
      bufferingRef.current = false;
      playedRef.current = true;
      setBuffering(false);
      setStatus({ kind: "ok" });
    };
    const onCanPlay = () => {
      bufferingRef.current = false;
      setBuffering(false);
      previewRef.current?.capture(video);
    };
    const onError = () => {
      // hls.js owns its retries; Safari's native HLS needs an explicit error path.
      if (engineRef.current || !video.error) return;
      console.warn("[AnimeShadow] Native video failed", format, video.error.code, video.error.message);
      setStatus({ kind: "failed", reason: `media:${video.error.code}` });
      onFailedRef.current();
    };
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onRateChange = () => setSpeed(video.playbackRate);
    const onResize = () => setVideoHeight(video.videoHeight);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("resize", onResize);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("resize", onResize);
      video.removeEventListener("error", onError);
    };
  }, [isWinner, format]);

  useEffect(() => {
    const onFsChange = () => {
      const fs = document.fullscreenElement;
      setIsFullscreen(fs != null && (fs === containerRef.current || fs.contains(containerRef.current)));
      if (!document.fullscreenElement) orientation()?.unlock?.();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Auto-hide once playback is running and nothing's been touched for a
  // bit; paused always keeps the bar up (nothing else to look at then).
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const shownAtRef = useRef(0);
  const overBarRef = useRef(false);
  const wake = () => {
    if (!controlsVisibleRef.current) shownAtRef.current = performance.now();
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (playingRef.current && !menuOpenRef.current) {
      // Not while the pointer rests on the bar — looking at a frame preview
      // or about to press something is not "nothing touched".
      const hide = () => {
        if (overBarRef.current) hideTimerRef.current = setTimeout(hide, CONTROLS_HIDE_MS);
        else setControlsVisible(false);
      };
      hideTimerRef.current = setTimeout(hide, CONTROLS_HIDE_MS);
    }
  };
  const toggleControls = () => {
    if (controlsVisibleRef.current && playingRef.current && !menuOpenRef.current) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setControlsVisible(false);
    } else {
      wake();
    }
  };
  /** Swallows the click that arrives right after the controls appeared. */
  const guardFresh = (event: React.MouseEvent) => {
    if (performance.now() - shownAtRef.current < FRESH_CONTROLS_MS) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  useEffect(() => {
    wake();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [playing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.preload = "auto";
      playRequestedRef.current = true;
      engineRef.current?.setPreloadOnly(false);
      if (!playedRef.current) video.muted = false;
      void video.play().catch(() => undefined);
    }
    else video.pause();
    wake();
  };

  const skip = (delta: number, show = true) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(
      Math.max(0, video.currentTime + delta),
      video.duration || Number.POSITIVE_INFINITY,
    );
    if (show) wake();
  };

  // Taps on the picture. A touch screen has no hover, so a tap shows or
  // hides the controls rather than pausing; two quick taps on the left or
  // right of the picture skip back or on, and every further quick tap on
  // that side adds another step — the way phone players work. A mouse click
  // plays or pauses, and a double click is full screen.
  const tapRef = useRef<{ at: number; side: number; timer: ReturnType<typeof setTimeout> | null }>({
    at: 0,
    side: 0,
    timer: null,
  });
  const [burst, setBurst] = useState<{ side: -1 | 1; seconds: number; id: number } | null>(null);
  const burstRef = useRef(burst);
  burstRef.current = burst;
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (tapRef.current.timer) clearTimeout(tapRef.current.timer);
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    },
    [],
  );

  const seekBurst = (side: -1 | 1) => {
    const step = settingsRef.current.step;
    skip(side * step, false);
    const prev = burstRef.current;
    setBurst(
      prev && prev.side === side
        ? { ...prev, seconds: prev.seconds + step }
        : { side, seconds: step, id: performance.now() },
    );
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current);
    burstTimerRef.current = setTimeout(() => setBurst(null), 700);
  };

  const onSurfaceTap = (event: React.PointerEvent<HTMLDivElement>) => {
    const tap = tapRef.current;
    const now = performance.now();
    const quick = now - tap.at < 300;
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      togglePlay();
      if (quick) {
        // The first click of the two already paused it: put that back.
        togglePlay();
        toggleFullscreen();
        tap.at = 0;
      } else {
        tap.at = now;
      }
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const side = x < 0.35 ? -1 : x > 0.65 ? 1 : 0;
    const bursting = burstRef.current?.side === side;
    if (side !== 0 && ((quick && tap.side === side) || bursting)) {
      if (tap.timer) clearTimeout(tap.timer);
      tap.timer = null;
      tap.at = now;
      seekBurst(side as -1 | 1);
      return;
    }
    tap.at = now;
    tap.side = side;
    if (tap.timer) clearTimeout(tap.timer);
    tap.timer = null;
    // On the sides the controls wait a moment, in case a second tap makes it a skip.
    if (side === 0) toggleControls();
    else
      tap.timer = setTimeout(() => {
        tap.timer = null;
        toggleControls();
      }, 260);
  };

  const openMenu = (page: SettingsPage) => {
    setMenu((open) => (open ? null : page));
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
  };
  // Closing the panel starts the controls' countdown again.
  useEffect(() => {
    if (!menuOpen) wake();
  }, [menuOpen]);

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
    showVolumeOsd(next);
    wake();
  };
  // A changed volume, said big in the middle for a moment: "65%".
  const [volumeOsd, setVolumeOsd] = useState<number | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showVolumeOsd = (v: number) => {
    setVolumeOsd(Math.round(v * 100));
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setVolumeOsd(null), 900);
  };

  const changeSpeed = (rate: number) => {
    if (!member) return;
    setPlayerSetting({ speed: rate });
    wake();
  };

  const pickQuality = (value: string) => {
    if (value !== "auto" && limitRef.current && Number(value) > limitRef.current) {
      toast(`${qualityName(Number(value))} — в PRO`, {
        description: `Без PRO плеер показывает до ${FREE_MAX_HEIGHT}p. ${PROMO_HINT}`,
        action: { label: "PRO", onClick: () => window.location.assign("/support") },
      });
      return;
    }
    setPlayerSetting({ quality: value });
  };

  const selectedQuality = effectiveQuality(settings.quality, Boolean(pro));
  const outputHeight = qualityOutputHeight(selectedQuality, Boolean(pro));
  // Apply the setting to both engines, including a subscription ending
  // during playback. The output canvas never controls encoded bitrate.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.setLevel(qualityLevel(engine.levels().map((level) => level.height), selectedQuality));
      return;
    }
    const video = videoRef.current;
    const available = variantsRef.current;
    if (!video || !available || !/Apple/.test(navigator.vendor) || !video.canPlayType("application/vnd.apple.mpegurl")) return;
    const cappedHeights = Object.keys(available).map(Number).filter((height) => height > 0 && (limitRef.current == null || height <= limitRef.current)).sort((a, b) => a - b);
    const top = cappedHeights[cappedHeights.length - 1];
    const picked = selectedQuality === "auto" ? top : cappedHeights[qualityLevel(cappedHeights, selectedQuality)];
    const url = picked != null ? available[String(picked)] : src;
    if (!video || !url || video.currentSrc === url) return;
    const at = video.currentTime;
    const wasPlaying = !video.paused;
    video.src = url;
    const restore = () => {
      video.currentTime = at;
      if (wasPlaying) void video.play().catch(() => undefined);
    };
    video.addEventListener("loadedmetadata", restore, { once: true });
    setActiveHeight(picked ?? null);
    return () => video.removeEventListener("loadedmetadata", restore);
  }, [selectedQuality, pro, levels, src]);

  const quality: QualityChoice = {
    value: selectedQuality,
    onPick: pickQuality,
    description: outputHeight != null && (activeHeight ?? videoHeight) > 0 && outputHeight > (activeHeight ?? videoHeight)
      ? `Вывод ${qualityName(outputHeight)} с масштабированием исходного потока ${activeHeight ?? videoHeight}p.` : undefined,
    options: [
      {
        value: "auto",
        label: selectedQuality === "auto" && activeHeight
          ? `${t("watch.ctl.qualityAuto")} · ${activeHeight}p`
          : t("watch.ctl.qualityAuto"),
      },
      ...qualityHeights(levels.length > 0 ? levels : videoHeight > 0 ? [videoHeight] : []).map((height) => ({
        value: String(height),
        label: height > FREE_MAX_HEIGHT ? `${qualityName(height)} · PRO` : qualityName(height),
      })),
    ],
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
    // The frame around the player, not the player itself: the next episode
    // is a new player (it was loading ahead), and full screen stays on.
    const container = (containerRef.current?.parentElement ?? containerRef.current) as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;
    const request =
      container?.requestFullscreen?.bind(container) ??
      container?.webkitRequestFullscreen?.bind(container);
    // A phone turns the picture on its side with it, as its own players do.
    void Promise.resolve(request?.())
      .then(() => {
        if (window.matchMedia?.("(pointer: coarse)").matches) return orientation()?.lock?.("landscape");
      })
      .catch(() => undefined);
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
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (target?.closest("input, textarea, select, button, a, [role=slider], [role=dialog], [contenteditable]:not([contenteditable=false])")) return;
      const video = videoRef.current;
      if (!video) return;
      switch ((e.key ?? "").toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          skip(-settingsRef.current.step);
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          skip(settingsRef.current.step);
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

  // Exact marks only, once each per episode: an opening is jumped over, an
  // ending at the very end counts as the episode's end (autoplay goes on).
  const skippedRef = useRef<{ src: string; done: Set<string> }>({ src, done: new Set() });
  if (skippedRef.current.src !== src) skippedRef.current = { src, done: new Set() };
  useEffect(() => {
    if (!member || !isWinner || !playing || duration <= 0) return;
    const seg = segmentAt(fitSegments(segments, duration, opening), currentTime);
    if (!seg || !seg.exact) return;
    const key = `${seg.kind}:${seg.start}`;
    if (skippedRef.current.done.has(key)) return;
    if ((seg.kind === "op" && !autoSkip.op) || (seg.kind === "ed" && !autoSkip.ed) || seg.kind === "recap") return;
    skippedRef.current.done.add(key);
    const video = videoRef.current;
    if (!video) return;
    if (seg.kind === "ed" && seg.stop >= duration - 5) onEndedRef.current?.();
    else video.currentTime = seg.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isWinner, playing, duration, member]);

  const shownTime = scrubTime ?? currentTime;
  const canPip =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled;

  const qualityLabel =
    selectedQuality !== "auto"
      ? qualityName(Number(selectedQuality))
      : activeHeight
        ? `${activeHeight}p`
        : t("watch.ctl.qualityAuto");
  const centerVisible = controlsVisible || !playing;
  // Preserve the real resolution, including 1080p/1440p and nonstandard encodes.
  const shownHeight = (() => {
    // Before the first switch: where the stream starts (the lowest, or the viewer's pick).
    const start = settings.quality !== "auto" && levels.includes(Number(settings.quality)) ? Number(settings.quality) : levels.length ? Math.min(...levels) : null;
    const hgt = activeHeight ?? (videoHeight || null) ?? start;
    if (!hgt) return null;
    return hgt;
  })();
  const lowerQuality = (() => {
    if (levels.length < 2 || !shownHeight) return null;
    const below = [...levels].sort((a, b) => a - b).filter((x) => x < shownHeight);
    return below.length ? below[below.length - 1]! : null;
  })();
  const netSpeed = netHistory.length ? netHistory[netHistory.length - 1]! : null;
  const showNet = isWinner && !netHidden && duration > 0 && (controlsVisible || buffering || status.kind === "retrying");
  const fitted = useMemo(() => fitSegments(segments, duration, opening), [segments, duration, opening]);
  const activeSegment = segmentAt(fitted, currentTime);
  const bandwidth = engineRef.current?.bandwidth() ?? 0;
  const loadingLine = [
    "Загрузка",
    activeHeight ? `${activeHeight}p` : null,
    bandwidth > 0 ? `${(bandwidth / 1_000_000).toFixed(1)} Мбит/с` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={containerRef}
      data-animeshadow-player=""
      className={cn(
        "@container/player absolute inset-0 size-full select-none bg-black",
        !isWinner && "pointer-events-none opacity-0",
        // The pointer goes with the controls, as in any player.
        isWinner && playing && !controlsVisible && !menuOpen && "cursor-none",
      )}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") wake();
      }}
    >
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        poster={poster ? imageSrc(poster) ?? undefined : undefined}
        muted
        // Both, deliberately: `loadedmetadata` is the earliest honest "this
        // stream answered" (and the only one the native-Safari path gets,
        // since it never goes through hls.js at all), `canplay` is the
        // backstop if a browser skips it. handleLoad ignores everything
        // after the first call, so firing twice costs nothing.
        onLoadedMetadata={applyResume}
        onCanPlay={applyResume}
        onEnded={() => onEndedRef.current?.()}
        style={{ filter: pro ? pictureFilter(settings.picture) : undefined }}
        className="absolute inset-0 size-full"
        tabIndex={-1}
      />
      {isWinner && outputHeight != null && videoHeight > 0 && videoHeight < outputHeight && (
        <VideoUpscaler videoRef={videoRef} source={src} height={outputHeight} filter={pro ? pictureFilter(settings.picture) : undefined}
          onUnavailable={() => {
            setPlayerSetting({ quality: "auto" });
            toast.info("Устройство не поддерживает выбранное разрешение", { description: "Плеер вернулся к автоматическому качеству." });
          }} />
      )}

      {isWinner && (
        <>
          {/* The picture: clicks and taps, as described at onSurfaceTap. */}
          <div aria-hidden className="absolute inset-0" onPointerUp={onSurfaceTap} />

          {burst && (
            <div
              key={burst.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 z-10 flex w-2/5 animate-in items-center justify-center bg-white/[0.08] duration-150 fade-in-0",
                burst.side < 0 ? "left-0 rounded-r-[50%]" : "right-0 rounded-l-[50%]",
              )}
            >
              <span className="flex flex-col items-center gap-1 text-white">
                {burst.side < 0 ? <RotateCcwIcon className="size-6" /> : <RotateCwIcon className="size-6" />}
                <span className="text-xs font-semibold tabular-nums">
                  {burst.side < 0 ? "−" : "+"}
                  {t("watch.ctl.stepValue", { n: burst.seconds })}
                </span>
              </span>
            </div>
          )}

          <div
            className={cn(
              "pointer-events-none absolute right-2 top-2 z-20 transition-[opacity,transform] duration-300 @md/player:right-3 @md/player:top-3",
              showNet ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
            )}
          >
            <NetStats
              speed={netSpeed}
              history={netHistory}
              height={shownHeight}
              outputHeight={outputHeight}
              bitrate={engineRef.current?.streamBitrate() ?? null}
              playbackRate={speed}
              bufferAhead={bufferAhead}
              lowerQuality={lowerQuality}
              onLower={() => lowerQuality && pickQuality(String(lowerQuality))}
              onClose={() => toggleNet(true)}
              className={cn(showNet && "pointer-events-auto")}
            />
          </div>
          {volumeOsd != null && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl bg-black/70 px-4 py-2.5 text-white backdrop-blur">
              {volumeOsd === 0 ? <VolumeXIcon className="size-5" /> : <Volume2Icon className="size-5" />}
              <span className="font-display text-xl tabular-nums">{volumeOsd}%</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/20">
                <span className="block h-full rounded-full bg-white" style={{ width: `${volumeOsd}%` }} />
              </span>
            </div>
          )}
          {popped && momentsOn && (
            <div className="absolute bottom-16 left-3 z-20 flex max-w-[min(20rem,calc(100%-1.5rem))] animate-in items-start gap-2 rounded-2xl border border-white/10 bg-black/70 p-2.5 pr-8 text-white shadow-xl backdrop-blur-md fade-in-0 slide-in-from-left-4 @lg/player:bottom-20">
              <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/30 text-[11px] font-bold">
                {popped.avatarUrl ? <img src={imageSrc(popped.avatarUrl)} alt="" className="size-full object-cover" /> : popped.author.charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-white/70">{popped.author}</span>
                <span className="line-clamp-3 text-xs leading-snug">{popped.body}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setMomentsOn(false);
                  setPopped(null);
                  try {
                    localStorage.setItem("as:moment-comments", "off");
                  } catch {
                    // Fine.
                  }
                }}
                aria-label="Не показывать комментарии в моментах"
                title="Не показывать комментарии в моментах"
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          {autoMuted && muted && (
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (video) video.muted = false;
                setAutoMuted(false);
              }}
              className="absolute bottom-16 left-1/2 z-30 inline-flex -translate-x-1/2 animate-in items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black shadow-lg fade-in-0 active:scale-95 @md/player:bottom-auto @md/player:top-3 @md/player:gap-2 @md/player:px-3.5 @md/player:py-2 @md/player:text-sm"
            >
              <VolumeXIcon className="size-4" />
              Включить звук
            </button>
          )}
          {status.kind === "failed" ? (
            <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4 text-center">
              <div className="flex max-w-xs flex-col items-center gap-2.5">
                <span className="grid size-12 place-items-center rounded-full bg-rose-500/20 text-rose-300">
                  <WifiOffIcon className="size-6" />
                </span>
                <div className="font-semibold text-white"><LoadingMessage failed /></div>
                <p className="text-xs leading-relaxed text-white/70">
                  Сервер с видео сейчас не отдаёт эту серию. Попробуйте ещё раз — продолжим с того же места — или выберите другой источник.
                </p>
                <button
                  type="button"
                  onClick={reload}
                  className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
                >
                  <RefreshCwIcon className="size-4" />
                  Повторить
                </button>
              </div>
            </div>
          ) : (playing && buffering) || status.kind === "retrying" ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
              {/* A phone gets the spinner and one line; the joke is for a big screen. */}
              <div className="flex max-w-[70%] flex-col items-center gap-1.5 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm @md/player:max-w-xs @md/player:gap-2 @md/player:px-4 @md/player:py-3">
                <Loader2Icon className="size-5 animate-spin text-white/90 @md/player:size-6" />
                <span className="hidden @md/player:block"><LoadingMessage /></span>
                <span className="block max-w-full truncate text-[10px] font-medium text-white/85 @md/player:text-[11px]">
                  {status.kind === "retrying"
                    ? `Связь прервалась — пробуем снова (${status.attempt})`
                    : loadingLine}
                </span>
              </div>
            </div>
          ) : null}

          {/* The middle of the picture: skip back, play, skip on — where a
              thumb is on a phone. With a mouse only the play button, and
              only while paused; the bar below has the rest. */}
          <div
            onClickCapture={guardFresh}
            className={cn(
              "pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-[10%] transition-opacity duration-200",
              centerVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <SkipButton
              dir={-1}
              seconds={settings.step}
              size="center"
              onSkip={() => skip(-settings.step)}
              label={t("watch.ctl.back", { n: settings.step })}
              className={cn("pointer-fine:hidden", centerVisible && "pointer-events-auto")}
            />
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? t("watch.pause") : t("watch.play")}
              className={cn(
                CENTER_BUTTON,
                "size-14 @md/player:size-16",
                playing ? "pointer-fine:hidden" : "bg-primary/90 text-primary-foreground ring-primary/40",
                playing && buffering && "invisible",
                centerVisible && "pointer-events-auto",
              )}
            >
              <MorphIcon
                on={playing}
                off={PlayIcon}
                onIcon={PauseIcon}
                className={cn("size-6 fill-current @md/player:size-7", !playing && "translate-x-0.5")}
              />
            </button>
            <SkipButton
              dir={1}
              seconds={settings.step}
              size="center"
              onSkip={() => skip(settings.step)}
              label={t("watch.ctl.forward", { n: settings.step })}
              className={cn("pointer-fine:hidden", centerVisible && "pointer-events-auto")}
            />
          </div>

          {/* "Пропустить …" while a marked part is on screen: the opening,
              the ending or a recap. */}
          {activeSegment && (
            <SkipSegmentButton
              key={`${src}:${activeSegment.kind}-${activeSegment.start}`}
              label={SEGMENT_LABEL[activeSegment.kind]}
              playing={playing}
              onSkip={() => {
                const video = videoRef.current;
                if (!video) return;
                if (activeSegment.kind === "ed" && activeSegment.stop >= duration - 5) onEndedRef.current?.();
                else video.currentTime = activeSegment.stop;
                wake();
              }}
            />
          )}

          <div
            onPointerDown={wake}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") overBarRef.current = true;
            }}
            onPointerLeave={() => {
              overBarRef.current = false;
            }}
            onClickCapture={guardFresh}
            className={cn(
              // Slides down with the fade rather than only fading: the bar
              // belongs to the bottom edge, so leaving is a movement toward
              // it, the way every other panel on the site leaves.
              "absolute inset-x-0 bottom-0 z-20 flex flex-col gap-0.5 px-2 pb-1 pt-8 transition-all duration-300 ease-out @md/player:gap-1 @md/player:px-3 @md/player:pb-2",
              tone.bar,
              controlsVisible
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0",
            )}
          >
            <SeekBar
              duration={duration}
              current={currentTime}
              buffered={buffered}
              segments={fitted}
              marks={marks}
              preview={preview}
              fill={tone.fill}
              label={t("watch.ctl.seek")}
              onActivity={wake}
              onScrub={setScrubTime}
              onCommit={(v) => {
                const video = videoRef.current;
                if (video) video.currentTime = v;
                wake();
              }}
            />

            <div className="flex items-center gap-0.5 text-white">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? t("watch.pause") : t("watch.play")}
                className={cn(CONTROL_BUTTON, tone.button, "pointer-coarse:hidden!")}
              >
                <MorphIcon
                  on={playing}
                  off={PlayIcon}
                  onIcon={PauseIcon}
                  className="size-4 fill-current"
                />
              </button>
              <SkipButton
                dir={-1}
                seconds={settings.step}
                onSkip={() => skip(-settings.step)}
                label={t("watch.ctl.back", { n: settings.step })}
                className="hidden @lg/player:grid pointer-coarse:hidden!"
              />
              <SkipButton
                dir={1}
                seconds={settings.step}
                onSkip={() => skip(settings.step)}
                label={t("watch.ctl.forward", { n: settings.step })}
                className="hidden @lg/player:grid pointer-coarse:hidden!"
              />

              <VolumeControl
                volume={volume}
                muted={muted}
                onVolume={changeVolume}
                onToggleMute={toggleMute}
                labels={{ mute: t("watch.mute"), unmute: t("watch.unmute"), volume: t("watch.ctl.volume") }}
              />

              <span className="ml-1 shrink-0 whitespace-nowrap font-display text-[11px] tabular-nums text-white/85 @md/player:text-xs">
                {formatTime(shownTime)}
                <span className="hidden text-white/45 @sm/player:inline"> / {formatTime(duration)}</span>
              </span>

              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                {qualityLabel && (
                  <button
                    type="button"
                    onClick={() => openMenu("quality")}
                    aria-label={`${t("watch.ctl.quality")}: ${qualityLabel}`}
                    title={t("watch.ctl.quality")}
                    className={cn(
                      "flex h-8 items-center rounded-lg px-1.5 transition-colors",
                      tone.button,
                      menu === "quality" && "bg-white/15",
                    )}
                  >
                    <span className="rounded-[5px] border border-white/45 px-1 text-[10px] font-semibold leading-4 tabular-nums">
                      {qualityLabel}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleNet(!netHidden)}
                  aria-pressed={!netHidden}
                  aria-label={netHidden ? "Показать скорость интернета" : "Скрыть скорость интернета"}
                  title={netHidden ? "Показать скорость интернета" : "Скрыть скорость интернета"}
                  className={cn(CONTROL_BUTTON, tone.button, "absolute left-12 top-2 bg-black/40 @sm/player:static @sm/player:bg-transparent", !netHidden && "text-emerald-300")}
                >
                  <SignalIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openMenu("main")}
                  aria-expanded={menu === "main"}
                  aria-label={t("watch.ctl.settings")}
                  title={t("watch.ctl.settings")}
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-medium transition-colors",
                    tone.button,
                    menu === "main" && "bg-white/15 text-white",
                  )}
                >
                  <Settings2Icon
                    className={cn("size-4 transition-transform duration-300", menu === "main" && "rotate-90")}
                  />
                  {speed !== 1 && <span className="hidden tabular-nums @sm/player:inline">{speedLabel(speed)}</span>}
                </button>

                {canPip && (
                  <button
                    type="button"
                    onClick={togglePip}
                    aria-label={t("watch.pip")}
                    className={cn(CONTROL_BUTTON, tone.button, "hidden @lg/player:flex pointer-coarse:hidden!")}
                  >
                    <PictureInPicture2Icon className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? t("watch.exitFullscreen") : t("watch.fullscreen")}
                  className={cn(CONTROL_BUTTON, tone.button)}
                >
                  <MorphIcon
                    on={isFullscreen}
                    off={Maximize2Icon}
                    onIcon={Minimize2Icon}
                    className="size-4"
                  />
                </button>
              </span>
            </div>
          </div>

          {/* The settings, inside the picture and never larger than it: on a
              phone the panel takes the player's corner over the bar, on a
              big screen it stands just above the bar. A tap beside it
              closes it. */}
          {menu && (
            <div
              className="absolute inset-0 z-30 flex items-end justify-end bg-black/35 p-2 @lg/player:bg-transparent @lg/player:p-3 @lg/player:pb-14"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeMenu();
              }}
            >
              <PlayerSettingsMenu
                key={menu}
                initialPage={menu}
                speed={settings.speed}
                onSpeed={changeSpeed}
                step={settings.step}
                onStep={(n) => setPlayerSetting({ step: n })}
                quality={quality}
                audio={{ value: tracks.audioId, options: tracks.audio.map((track) => ({ value: track.id, label: track.label })), onPick: (id) => pickTrack("audio", id) }}
                subtitles={{ value: tracks.subtitleId, options: [{ value: -1, label: "Выключены" }, ...tracks.subtitles.map((track) => ({ value: track.id, label: track.label }))], onPick: (id) => pickTrack("subtitles", id) }}
                onClose={closeMenu}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The screen's orientation lock, where the browser has one (phones). */
function orientation():
  | { lock?: (to: string) => Promise<void>; unlock?: () => void }
  | undefined {
  return typeof screen === "undefined"
    ? undefined
    : (screen.orientation as unknown as { lock?: (to: string) => Promise<void>; unlock?: () => void } | undefined);
}

function Player({
  studio,
  trackProgress = true,
  autoStart,
  onStarted,
  poster,
  data,
  episodePoster,
  title,
  animeId,
  episodesTotal,
  catalog,
  runtime,
  episode,
  onEpisodeChange,
  onRefreshSources,
  useOwn,
  canUseOwn,
  canUseProvider,
  onUseOwnChange,
  onAllFailed,
  startAt = null,
}: {
  studio?: StudioId | undefined;
  trackProgress?: boolean;
  autoStart: boolean;
  onStarted: () => void;
  poster?: string | undefined;
  episodePoster?: string | null;
  /** Opened from a moment: seek here once, on that episode. */
  startAt?: { episode: number; seconds: number } | null;
  data: WatchResponse;
  title: string;
  animeId: number;
  episodesTotal: number | null;
  /** Everything the sources say about each episode — see useEpisodeCatalog. */
  catalog: EpisodeCatalog;
  /** The title's runtime string, so an episode can tick itself off. */
  runtime: string | null;
  episode: number;
  onEpisodeChange: (episode: number) => void;
  onRefreshSources: () => Promise<unknown>;
  /** Which of the two players is on screen — see WatchSection for the split. */
  useOwn: boolean;
  /** Is there a direct stream at all? Without one our side has nothing to play. */
  canUseOwn: boolean;
  canUseProvider: boolean;
  onUseOwnChange: (useOwn: boolean) => void;
  /** Every source on this side is dead — the other side is worth a try. */
  onAllFailed?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const [partySetup, setPartySetup] = useState(false);
  const [actuallyPlaying, setActuallyPlaying] = useState(false);
  const { picture } = usePlayerSettings();
  // Picture filters are PRO: without it the saved look isn't applied.
  const pro = useIsPro();
  const t = useT();
  // Sources arrive ranked best-first (verified-reachable ones lead). Rather
  // than load one and wait to find out it's dead, load the top few at once,
  // invisibly, and show whichever answers first — the viewer never watches
  // a stall timer count down on a source that was going to fail anyway.
  // Except when the top pick is already confirmed reachable (see
  // initialRacePool) — then it's shown alone, trusted outright.
  const linkedStudio = new URLSearchParams(window.location.search).get("studio") === "hon-kon"
    ? data.sources.find(source => /hon[\s-]*kon/i.test(source.title))?.title ?? null : null;
  const [favouriteDub, setFavouriteDub] = useState<string | null>(() =>
    linkedStudio ?? readFavouriteDub(animeId),
  );
  const [racePool, setRacePool] = useState<string[]>(() =>
    initialRacePool(data.sources, linkedStudio ?? readFavouriteDub(animeId) ?? readWorkingDub(animeId)),
  );
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const racePoolRef = useRef(racePool);
  racePoolRef.current = racePool;
  // Every source this session has already raced and lost — so a handful of
  // dead mirrors don't leave the user staring at a spinner for minutes: we
  // keep pulling in fresh batches automatically and only ask them to pick
  // once nothing is left to try.
  const [triedIds, setTriedIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  // How our own player is dressed. A real preference — someone who wants
  // the glass bar wants it on every episode — so unlike the old theatre
  // toggle this one is remembered.
  const [skin] = useState<PlayerSkin>(() => readSkin());
  // Whether finishing an episode should load the next one. Remembered,
  // because that *is* a preference — and defaulting to on, since the whole
  // point of a series is that there is another one after this.
  const member = useAuth().status === "authenticated";
  const { prefs, toggle: togglePref } = usePlayerPrefs(member);
  const autoNext = prefs.autoNext;

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
  const progressOwner = useAuth().user?.id;
  const { data: savedProgress } = useAnimeProgress(animeId, authed && trackProgress, progressOwner);
  const progress = trackProgress && authed ? savedProgress : undefined;
  // The server's rows, and what this device played since — the list moves
  // while the episode plays, for guests too, without asking the server.
  const localProgress = useLocalProgress(trackProgress ? animeId : 0);
  const watchedEpisodes = useMemo(() => {
    const map = new Map<number, { completed: boolean; position: number; duration: number | null; at: number }>();
    for (const row of progress?.episodes ?? []) {
      map.set(row.episode, { completed: row.completed, position: row.positionSeconds, duration: row.durationSeconds, at: Date.parse(row.updatedAt) || 0 });
    }
    return mergeProgress(map, localProgress);
  }, [progress, localProgress]);
  const localResume = watchedEpisodes.get(episode);

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
  const watching = trackProgress && winnerId != null && inView && actuallyPlaying;

  useWatchSession({ animeId, episode, active: watching });
  const update = useUpdateProgress(animeId, progressOwner);

  // Direct players monitor actual data, including stalls after playback began.
  // Only iframe sources need this coarse load timeout.
  useEffect(() => {
    if (winnerId != null || racePool.length === 0) return;
    const poolHasHls = racePool.some(
      (id) => { const format = data.sources.find((s) => s.id === id)?.format; return format === "hls" || format === "mp4"; },
    );
    if (poolHasHls) return;
    const timeout = triedIds.length === 0
        ? STALL_MS
        : STALL_MS_RETRY;
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

  // Only the last episode, or a film, has nowhere to go next.
  const nextEpisode =
    episodesTotal != null && episode < episodesTotal ? episode + 1 : null;
  // An iframe never tells us it reached the end, so this only ever fires for
  // our own player. Nothing is silently skipped: the toggle sits right above
  // the picture, and it stops at the last episode.
  const handleEnded = () => {
    if (autoNext && nextEpisode != null) onEpisodeChange(nextEpisode);
  };

  // ---- Kodik: its player API tells us where it is, and takes a seek. ----
  // The player moved into a real window of its own, outside the browser
  // (Document Picture-in-Picture: Chrome and Edge on a computer), if it is.
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [kodikFrame, setKodikFrame] = useState<HTMLIFrameElement | null>(null);
  const winnerSource = data.sources.find((s) => s.id === winnerId) ?? null;
  const winnerIsKodik =
    winnerSource != null && winnerSource.format !== "hls" && isKodikUrl(sourceUrlFor(winnerSource, episode) ?? winnerSource.embedUrl);
  useEffect(() => {
    setKodikFrame(winnerIsKodik && winnerId ? frames.current.get(winnerId) ?? null : null);
    // pipWin: the frame is a new element once moved into (or out of) the window.
  }, [winnerId, winnerIsKodik, pipWin]);

  // Where the opening and ending are: the provider's own data first, then
  // AniSkip through our API.
  const known = catalog.info.get(episode)?.opening ?? null;
  const wantTimes = (winnerIsKodik || winnerSource?.format === "hls" || winnerSource?.format === "mp4") && (prefs.skipOpening || prefs.skipEnding);
  const { data: skipTimes } = useQuery({
    queryKey: ["skip-times", animeId, episode],
    staleTime: Infinity,
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<{
        opening: { start: number; stop: number } | null;
        ending: { start: number; stop: number } | null;
        segments?: SkipSegmentRaw[];
      }>(
        `/anime/${animeId}/skip-times`,
        { signal, query: { episode } },
      ),
  });
  // Fitted to the length Kodik reports; only exact marks are skipped by themselves.
  const kodikSegments = (): SkipSegment[] => fitSegments(skipTimes?.segments, lastDuration.current, known);
  // Called only from Kodik's time events (after the refs below exist), never during render.
  const hasSkipTimes = known != null || (skipTimes?.segments?.length ?? 0) > 0;

  // Once per episode each: resume, skip the opening, act on the ending.
  const done = useRef({ episode, resumed: false, opening: false, ending: false });
  if (done.current.episode !== episode) done.current = { episode, resumed: false, opening: false, ending: false };
  const [notice, setNotice] = useState<string | null>(null);
  // The player folded into a small window in the corner of the page…
  const [mini, setMini] = useState(false);
  // …or into a real window of its own (pipWin, declared with the frames).
  const folded = mini || pipWin != null;
  // Where playback was: moving the player to another window reloads the
  // embed, which then picks up from here.
  const lastTime = useRef(0);
  const lastDuration = useRef(0);
  const handoff = useRef<{ episode: number; seconds: number } | null>(null);
  const resumeAt = useRef<number | null>(null);
  useEpisodeTracking({
    animeId, episode, seedPosition: episodeRecord?.positionSeconds ?? 0,
    active: watching, runtime, alreadyDone: episodeRecord?.completed ?? false,
    readClock: () => ({ position: lastTime.current, duration: lastDuration.current }),
  });

  // A comment's moment, chosen on the page: same episode — seek; another — switch and start there.
  const [jump, setJump] = useState<JumpDetail | null>(null);
  const winnerIsKodikRef = useRef(false);
  useEffect(() => {
    const onJump = (e: Event) => {
      const d = (e as CustomEvent<JumpDetail>).detail;
      if (d.episode === episode) {
        if (winnerIsKodikRef.current) kodikSeekRef.current?.(d.seconds);
        else window.dispatchEvent(new CustomEvent("as:player-seek", { detail: { seconds: d.seconds } }));
        return;
      }
      setJump(d);
      resumeAt.current = d.seconds;
      onEpisodeChange(d.episode);
    };
    window.addEventListener("as:jump", onJump);
    return () => window.removeEventListener("as:jump", onJump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode]);
  const kodikSeekRef = useRef<((s: number) => void) | null>(null);

  // Marks on our player's bar: this episode's comments tied to moments.
  const { data: markData } = useQuery({
    queryKey: ["comment-marks", animeId, episode],
    queryFn: ({ signal }) => apiRequest<{ marks: CommentMark[] }>(`/anime/${animeId}/comment-marks`, { signal, query: { episode } }),
    staleTime: 60_000,
  });

  // A moment's link: Kodik is sent there once its player reports time.
  const startUsed = useRef(false);
  useEffect(() => {
    if (!startUsed.current && startAt && startAt.episode === episode) {
      startUsed.current = true;
      resumeAt.current = startAt.seconds;
    }
  }, [startAt, episode]);
  const momentStart = jump && jump.episode === episode ? jump.seconds : startAt && startAt.episode === episode ? startAt.seconds : null;

  // Pin where the picture is now as a favourite moment (five at most).
  const addMoment = useAddMoment();
  const pinMoment = () => {
    if (!authed) {
      toast.info("Любимые моменты — для участников", {
        description: "Войдите и сохраняйте сцены с таймкодом прямо в профиль",
        action: { label: "Войти", onClick: () => window.location.assign("/register") },
      });
      return;
    }
    const seconds = Math.floor(lastTime.current);
    addMoment.mutate(
      { animeId, episode, seconds, dub: (winner ?? displaySource)?.title?.slice(0, 80) || undefined },
      {
        onSuccess: () => toast.success(`Момент сохранён: серия ${episode}, ${formatClock(seconds)}`, { description: "Он в профиле, в блоке «Моя пятёрка»" }),
        onError: (e) => toast.error("Не получилось сохранить", { description: e instanceof Error ? e.message : undefined }),
      },
    );
  };

  // A guest's speed and quality last for the page; a member's are remembered.
  useEffect(() => persistPlayerSettings(authed), [authed]);

  // Tracking flushes the previous episode before this effect clears its clock.
  useEffect(() => {
    lastTime.current = 0;
    lastDuration.current = 0;
  }, [episode]);

  const fold = async () => {
    if (pipWin) {
      pipWin.close();
      return;
    }
    if (mini) {
      setMini(false);
      return;
    }
    const api = (window as unknown as { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
    if (!api) {
      setMini(true);
      return;
    }
    try {
      const win = await api.requestWindow({ width: 720, height: 470 });
      copyStylesInto(win.document);
      win.document.title = title;
      resumeAt.current = lastTime.current;
      win.addEventListener("pagehide", () => {
        resumeAt.current = lastTime.current;
        setPipWin(null);
      });
      setPipWin(win);
    } catch {
      setMini(true);
    }
  };
  // Leaving the page closes the window too.
  useEffect(() => () => pipWin?.close(), [pipWin]);
  const [countdown, setCountdown] = useState<number | null>(null);

  const kodik = useKodikBridge(kodikFrame, {
    onStarted: () => {
      setActuallyPlaying(true);
      try { if (winnerSource) localStorage.setItem(`as:last-working:${animeId}`, winnerSource.title); } catch { /* Session only. */ }
      onStarted();
    },
    onPlay: () => setActuallyPlaying(true),
    onPause: () => setActuallyPlaying(false),
    onDuration: (d) => {
      lastDuration.current = d;
    },
    onTime: (time) => {
      lastTime.current = time;
      publishClock(animeId, episode, time);
      if (trackProgress) recordLocalProgress(animeId, episode, time, lastDuration.current);
      if (resumeAt.current != null) {
        const at = resumeAt.current;
        resumeAt.current = null;
        if (at > 5 && time < at - 5) {
          kodik.seek(at);
          return;
        }
      }
      const d = done.current;
      const saved = episodeRecord?.completed ? 0 : (episodeRecord?.positionSeconds ?? 0);
      if (prefs.resume && !d.resumed && time < 10 && saved > 30) {
        d.resumed = true;
        kodik.seek(saved);
        setNotice(t("watch.resumed", { time: formatClock(saved) }));
        return;
      }
      if (time > 10) d.resumed = true;
      const segs = kodikSegments();
      const op = segs.find((x) => x.kind === "op" && x.exact);
      const ed = segs.find((x) => x.kind === "ed" && x.exact);
      if (prefs.skipOpening && op && !d.opening && time >= op.start && time < op.stop - 2) {
        d.opening = true;
        kodik.seek(op.stop);
        setNotice(t("watch.skippedOpening"));
        return;
      }
      if (prefs.skipEnding && ed && !d.ending && time >= ed.start && time < ed.stop - 2) {
        d.ending = true;
        if (autoNext && nextEpisode != null) setCountdown(5);
        else kodik.seek(ed.stop);
      }
    },
    onEnded: () => {
      if (autoNext && nextEpisode != null && countdown == null) setCountdown(5);
    },
  });
  kodikSeekRef.current = (seconds) => kodik.seek(seconds);
  winnerIsKodikRef.current = winnerIsKodik;

  // The next episode starts after a short, cancellable count.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (nextEpisode != null) onEpisodeChange(nextEpisode);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);
  useEffect(() => setCountdown(null), [episode]);
  // Which episode asked for the next one to be loaded ahead (see CustomHlsPlayer.onNearEnd).
  const [preloadFor, setPreloadFor] = useState<number | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Shift+N / Shift+P: next and previous episode, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!authed) return;
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.code === "KeyN" && nextEpisode != null) onEpisodeChange(nextEpisode);
      if (e.code === "KeyP" && episode > 1) onEpisodeChange(episode - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [episode, nextEpisode, onEpisodeChange, authed]);

  // `exhausted` means the race tried everything it had and nothing
  // answered. Reported once per mount, which is enough: the parent
  // responds by handing us a different set of sources, which remounts us.
  const reportedFailureRef = useRef(false);
  useEffect(() => {
    if (winnerId != null || racePool.length > 0) return;
    if (reportedFailureRef.current) return;
    reportedFailureRef.current = true;
    onAllFailed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerId, racePool.length]);

  // The list offers every episode any dub has, so the one just chosen may
  // not be in the dub on screen. Rather than let that dub's page play
  // something else, move to the best-ranked dub on this side that does
  // carry it. If none here does, the list dims it and the parent's clamp
  // and side switch are what catch it.
  useEffect(() => {
    setTriedIds([]);
    reportedFailureRef.current = false;
    const current = data.sources.find((s) => s.id === (winnerId ?? racePool[0]));
    if (!current) {
      setWinnerId(null);
      setRacePool(initialRacePool(data.sources, favouriteDub));
      return;
    }
    const has = episodesOf(current);
    if (has == null || has.has(episode)) return;
    const better = viableSources(data.sources).find((s) => episodesOf(s)?.has(episode));
    if (better && better.id !== current.id) {
      setWinnerId(null);
      setRacePool([better.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode]);

  // Everything this component has left to compute needs a source in the
  // picture, so the bail-out comes after the last hook, not before it —
  // React requires every hook to run on every render, and the two below
  // used to sit past this line.
  if (!displaySource) return null;

  const searching = winnerId == null && racePool.length > 0;
  const exhausted = winnerId == null && racePool.length === 0;
  // Auto-retry is the offered fix when everything's failed — the raw list is
  // now an opt-in "pick manually" escape hatch (via the existing "not
  // working" toggle), not something dumped on the viewer automatically.
  // Confirmed-dead sources (a probe that actually failed — Alloha not
  // responding at all is exactly this) never make it into that list; showing
  // a pick the server already knows is broken just moves the "doesn't load"
  // problem one click later instead of fixing it. Two providers can also
  // independently carry the exact same dub (same studio, same name) — kept
  // once, the better-ranked of the two, since `data.sources` already arrives
  // sorted best-first.
  const pickable = dedupeSources(viableSources(data.sources));

  const pick = (id: string) => {
    if (id === winnerId) return;
    racePoolRef.current = [id];
    handoff.current = { episode, seconds: lastTime.current };
    setTriedIds([]);
    reportedFailureRef.current = false;
    setWinnerId(null);
    setRacePool([id]);
  };

  /** Ticking an episode by hand — the counterpart to the automatic mark. */
  const toggleWatched = (n: number) => {
    const state = watchedEpisodes.get(n);
    markLocalEpisode(animeId, n, !(state?.completed ?? false));
    update.mutate({
      episode: n,
      positionSeconds: state?.position ?? 0,
      completed: !(state?.completed ?? false),
    });
  };

  /** Star a dub, or un-star it — the same button both ways. */
  const toggleFavourite = (title: string) => {
    if (!authed) {
      toast.info("Любимая озвучка — для участников", { description: "Войдите, и сайт будет сразу включать её" });
      return;
    }
    const next = favouriteDub === title ? null : title;
    setFavouriteDub(next);
    try {
      if (next) localStorage.setItem(dubKey(animeId), next);
      else localStorage.removeItem(dubKey(animeId));
    } catch {
      // Private browsing, blocked storage — it just won't stick.
    }
  };

  const handleLoad = (id: string) => {
    if (!racePoolRef.current.includes(id)) return;
    setWinnerId((current) => {
      if (current != null) return current;
      // Keep the winner's own iframe mounted (same DOM node, same key) —
      // dropping every other racer immediately, but never remounting the
      // one that just finished loading.
      setRacePool([id]);
      return id;
    });
  };

  /** A source that reported it cannot play at all. Retires it and pulls the
   *  next candidate straight away — the same move the stall timer makes, just
   *  without waiting out a timeout for an answer we have already been given. */
  const handleFailed = (id: string) => {
    if (!racePoolRef.current.includes(id)) return;
    if (winnerId != null && winnerId !== id) return;
    setActuallyPlaying(false);
    setNotice("Источник не ответил. Проверяем следующую озвучку…");
    handoff.current = { episode, seconds: lastTime.current };
    setWinnerId(null);
    setTriedIds((tried) => {
      if (tried.includes(id)) return tried;
      const nextTried = [...tried, id];
      const remaining = viableSources(data.sources).filter(
        (s) => !nextTried.includes(s.id),
      );
      setRacePool(remaining.slice(0, RACE_SIZE).map((s) => s.id));
      return nextTried;
    });
  };

  /** Retries from the very top, as if the page had just been opened. */
  const retryAll = () => {
    handoff.current = { episode, seconds: lastTime.current };
    reportedFailureRef.current = false;
    setAttempt((value) => value + 1);
    setTriedIds([]);
    setWinnerId(null);
    setRacePool(initialRacePool(data.sources, favouriteDub));
  };



  const stageContent = (
    <>
        <button
          type="button"
          onClick={() => void fold()}
          aria-label={folded ? t("watch.miniOff") : t("watch.miniOn")}
          title={folded ? t("watch.miniOff") : t("watch.miniOn")}
          className="absolute left-2 top-2 z-30 grid size-8 place-items-center rounded-lg bg-black/60 text-white/80 opacity-70 transition-opacity hover:bg-black/80 hover:text-white hover:opacity-100 focus-visible:opacity-100"
        >
          {folded ? <Maximize2Icon className="size-4" /> : <PictureInPicture2Icon className="size-4" />}
        </button>
        {racePool.map((id) => {
          const source = data.sources.find((s) => s.id === id);
          if (!source) return null;
          const isWinner = id === winnerId;

          if (source.format === "hls" || source.format === "mp4") {
            const url = sourceUrlFor(source, episode);
            if (!url) return null;
            // The next episode, loading out of sight once this one is almost
            // done. Both are keyed by their address: when the episode moves
            // on, the one already loaded *is* the new episode — React keeps
            // it, and it starts at once instead of from nothing.
            const nextUrl =
              isWinner && preloadFor === episode && nextEpisode != null ? sourceUrlFor(source, nextEpisode) : null;
            return (
              <Fragment key={`${source.id}:${attempt}`}>
              <CustomHlsPlayer
                format={source.format}
                autoStart={autoStart}
                onStarted={() => {
                  try { localStorage.setItem(`as:last-working:${animeId}`, source.title); } catch { /* Session only. */ }
                  onStarted();
                }}
                onPlaybackChange={setActuallyPlaying}
                poster={poster}
                key={episode}
                src={url}
                mediaTitle={`${title} · Серия ${episode}`}
                onRefreshSource={onRefreshSources}
                variants={source.hlsVariants?.[String(episode)] ?? null}
                skin={skin}
                isWinner={isWinner}
                onReady={() => handleLoad(id)}
                onFailed={() => handleFailed(id)}
                resumeFrom={handoff.current?.episode === episode ? handoff.current.seconds : momentStart ?? (localResume && !localResume.completed ? localResume.position : authed ? (episodeRecord?.positionSeconds ?? 0) : 0)}
                resumeExact={handoff.current?.episode === episode || momentStart != null}
                onEnded={handleEnded}
                onTime={(time, length) => {
                  if (!isWinner) return;
                  lastTime.current = time;
                  if (length > 0) lastDuration.current = length;
                  publishClock(animeId, episode, time);
                  if (trackProgress) recordLocalProgress(animeId, episode, time, length);
                }}
                marks={markData?.marks}
                opening={source.episodeMeta?.[String(episode)]?.opening ?? null}
                segments={skipTimes?.segments}
                autoSkip={{ op: prefs.skipOpening, ed: prefs.skipEnding }}
                onNearEnd={() => setPreloadFor(episode)}
              />
              {nextUrl && nextUrl !== url && (
                <CustomHlsPlayer
                  format={source.format}
                  key={nextEpisode}
                  src={nextUrl}
                  variants={source.hlsVariants?.[String(nextEpisode)] ?? null}
                  skin={skin}
                  isWinner={false}
                  onReady={() => undefined}
                  onFailed={() => undefined}
                />
              )}
              </Fragment>
            );
          }

          const embed = sourceUrlFor(source, episode);
          if (!embed || !isKodikUrl(embed)) return null;
          return <iframe key={`${source.id}:${episode}:${attempt}`} src={embed}
            ref={(node) => { if (node) frames.current.set(id, node); else frames.current.delete(id); }}
            onLoad={() => handleLoad(id)} onError={() => handleFailed(id)}
            title={`Kodik Player · ${source.title} · Серия ${episode}`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen
            referrerPolicy="origin" className={cn("absolute inset-0 size-full border-0", !isWinner && "invisible")}
          />;
        })}
        {notice && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 animate-in rounded-lg bg-black/75 px-2.5 py-1 text-xs font-medium text-white fade-in-0 slide-in-from-top-1">
            {notice}
          </div>
        )}
        {countdown != null && nextEpisode != null && (
          <div className="absolute bottom-14 right-3 z-20 flex animate-in items-center gap-2 rounded-xl border border-white/15 bg-black/80 py-1.5 pl-3 pr-1.5 text-xs text-white fade-in-0 slide-in-from-bottom-2">
            <span>{t("watch.nextIn", { n: nextEpisode, s: countdown })}</span>
            <button
              type="button"
              onClick={() => {
                setCountdown(null);
                onEpisodeChange(nextEpisode);
              }}
              className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground"
            >
              {t("watch.nextNow")}
            </button>
            <button
              type="button"
              onClick={() => setCountdown(null)}
              aria-label={t("common.cancel")}
              className="grid size-6 place-items-center rounded-md text-white/70 hover:bg-white/15 hover:text-white"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}
        {searching && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-white/70">
            <Loader2Icon className="size-6 animate-spin text-primary" />
            <p className="text-xs">{t("watch.findingSource")}</p>
          </div>
        )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className="watch-panel flex w-full min-w-0 flex-col gap-2.5"
    >
      {/* Current pick, one line — the episode control lives right in it
          (only for signed-in viewers: nothing persists otherwise, so a
          control that quietly does nothing would just be confusing)
          instead of floating on its own row above the player. One card
          instead of bare text/buttons on the page background, so the whole
          row reads as a single control bar. */}
      <div className="watch-toolbar flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2 text-sm sm:px-3">
        {(canUseOwn || canUseProvider) && (
          <PlayerSwitch
            useOwn={useOwn}
            canUseOwn={canUseOwn}
            canUseProvider={canUseProvider}
            onChange={onUseOwnChange}
          />
        )}
        {/* What is on screen, by number and — where anyone has published
            one — by name. */}
        <span className="order-last flex w-full min-w-0 items-start gap-2 border-t border-border/50 pt-2 text-xs sm:order-none sm:w-auto sm:flex-1 sm:border-0 sm:pt-0">
          <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-display tabular-nums text-primary">
            {episode}
          </span>
          <span className="min-w-0 break-words font-medium leading-relaxed [overflow-wrap:anywhere]">
            {catalog.info.get(episode)?.title ?? t("detail.episodeNumber", { n: episode })}
          </span>
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
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Watching together: a room on this episode, then a link for friends. */}
          {winnerId != null && (
            <button
              type="button"
              onClick={() => {
                if (!authed) {
                  navigate("/login", { state: { from: window.location.pathname } });
                  return;
                }
                setPartySetup(true);
              }}
              title="Смотреть вместе с друзьями — до 10 человек, с чатом"
              className="inline-flex size-8 items-center justify-center gap-1.5 rounded-full border border-[var(--accent-line-soft)] text-xs font-semibold text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60 sm:w-auto sm:px-3"
            >
              <UsersIcon className="size-3.5" />
              <span className="hidden sm:inline">Вместе</span>
            </button>
          )}
          {partySetup && <PartySetupDialog
            open onClose={() => setPartySetup(false)} animeId={animeId} episode={episode} title={title}
            studio={studio ?? (new URLSearchParams(window.location.search).get("studio") === "hon-kon" ? "hon-kon" : undefined)}
          />}
          {/* The picture's look — for any player, Kodik's included (the filter sits on its frame). */}
          {winnerId != null && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Картинка: яркость, контраст, цвет"
                  title="Картинка"
                  className={cn(
                    "grid size-8 place-items-center rounded-full border border-[var(--accent-line-soft)] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
                    pro && pictureFilter(picture) && "border-primary/40 text-primary",
                  )}
                >
                  <PaletteIcon className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                collisionPadding={12}
                className="w-[min(18.5rem,calc(100vw-1.5rem))] rounded-2xl border-white/10 bg-neutral-950/95 p-2.5 text-white shadow-2xl backdrop-blur-md"
              >
                <p className="flex items-center gap-1.5 px-1 pb-2.5 text-sm font-semibold">
                  <PaletteIcon className="size-4 text-primary" />
                  Картинка
                </p>
                <PicturePanel picture={picture} />
              </PopoverContent>
            </Popover>
          )}
          {winnerId != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={pinMoment}
                  disabled={addMoment.isPending}
                  aria-label="Любимый момент"
                  className="moment-btn relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full bg-primary px-2 text-xs font-bold sm:px-3.5 text-white shadow-lg shadow-primary/30 transition-transform hover:-translate-y-px active:scale-95 disabled:opacity-60"
                >
                  {authed ? <BookmarkPlusIcon className="moment-btn-icon size-4" /> : <LockIcon className="size-3.5" />}
                  <span className="hidden sm:inline">Любимый момент</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-64 border border-[var(--accent-line-soft)] bg-popover p-3 text-popover-foreground shadow-xl">
                {/* How it works, played out: the playhead runs, stops on a scene, the mark pops. */}
                <div className="mh-demo relative mb-2.5 h-16 overflow-hidden rounded-lg bg-gradient-to-br from-sky-900/60 via-fuchsia-900/40 to-black">
                  <span className="mh-scene absolute inset-0" />
                  <span className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-white/20">
                    <span className="mh-fill block h-full rounded-full bg-primary" />
                  </span>
                  <span className="mh-pin absolute bottom-3 grid size-6 place-items-center rounded-full bg-primary text-white shadow-lg">
                    <BookmarkPlusIcon className="size-3.5" />
                  </span>
                  <span className="mh-tag absolute right-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">3 серия · 12:34</span>
                </div>
                <ol className="flex flex-col gap-1 text-[11.5px] leading-snug">
                  <li><b className="text-primary">1.</b> Дойдите до любимой сцены</li>
                  <li><b className="text-primary">2.</b> Нажмите «Любимый момент»</li>
                  <li><b className="text-primary">3.</b> Сцена с серией, таймкодом и озвучкой — в профиле, до пяти штук</li>
                </ol>
                {!authed && <p className="mt-2 text-[11px] font-semibold text-primary">Доступно после входа — бесплатно</p>}
              </TooltipContent>
            </Tooltip>
          )}
          {/* Both of these only mean anything for our own player: a
              cross-origin embed brings its own everything and never tells us
              an episode ended. Rather than show dead controls, they appear
              only when the source in the picture is one we drive. */}
          {/* Kodik refuses some countries outright and says so inside its
              own frame, where we can't see it — so the explanation sits
              here, one hover away, for whoever gets that message. */}
          {displaySource.format === "iframe" && (
            <InfoTooltip side="bottom" className="size-4 opacity-70 hover:opacity-100">
              {t("watch.geoHint")}
            </InfoTooltip>
          )}
        </span>

      </div>

      {/* Nothing worked automatically — offer the fix as one button, not a
          list of source names the viewer has to interpret themselves. The
          manual list is still there (via "not working" above) for the rare
          case even this doesn't help. */}
      {exhausted && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-4 text-center">
          <LoadingMessage failed />
          <Button size="sm" onClick={retryAll}>
            <RefreshCwIcon />
            {t("watch.retry")}
          </Button>
        </div>
      )}

      {/* The picture and the two lists you actually reach for while it is
          playing, side by side on a wide screen. Below `lg` the column
          drops under the video with a height of its own — stacking it full
          height would push the next section off the screen entirely. */}
      <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-stretch">
      {/* Kodik keeps its own controls inside the picture; the site adds
          nothing under it. Our own bar exists only in our own player. */}
      <div className="flex min-w-0 flex-col">
      <div
        className={cn(
          "player-box relative aspect-video overflow-hidden border bg-black",
          // Edge to edge on a phone: every pixel of width is picture.
          "w-full min-w-0 rounded-xl",
        )}
      >
        {/* Folded away — into a window outside the browser, or a small one
            in the corner: the box keeps its place and says where it went. */}
        {folded && (
          <button
            type="button"
            onClick={() => void fold()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            <PictureInPicture2Icon className="size-6 text-primary" />
            {pipWin ? t("watch.pipPlaceholder") : t("watch.miniPlaceholder")}
          </button>
        )}
        {pipWin ? (
          createPortal(
            <div className="flex h-screen flex-col bg-black p-1.5">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg">{stageContent}</div>
            </div>,
            pipWin.document.body,
          )
        ) : (
          // Everything that plays lives in this one box; folding it into the
          // corner only changes the box's position, never its children, so
          // the video keeps playing without a reload.
          <div
            className={cn(
              mini
                ? "fixed bottom-[calc(var(--mobile-nav-space,0px)+1rem)] left-4 z-50 aspect-video w-[min(26rem,calc(100vw-2rem))] animate-in overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl shadow-black/60 fade-in-0 slide-in-from-bottom-4"
                : "absolute inset-0",
            )}
          >
            {stageContent}
          </div>
        )}
      </div>
      </div>

        <div className="relative min-w-0">
        <PlayerSidePanel
          total={episodesTotal ?? 0}
          episode={episode}
          onEpisodeChange={onEpisodeChange}
          catalog={catalog}
          fallbackDuration={runtime}
          fallbackPoster={episodePoster}
          currentEpisodes={episodesOf(displaySource)}
          watched={watchedEpisodes}
          showProgress={trackProgress}
          canMark={authed && trackProgress}
          onToggleWatched={toggleWatched}
          sources={pickable}
          currentSourceId={displaySource.id}
          favouriteDub={favouriteDub}
          onPickSource={pick}
          onToggleFavourite={toggleFavourite}
          sourceLabel={sourceLabel}
          footer={
            <PlayerPrefsBar
              locked={!authed}
              prefs={prefs}
              onToggle={togglePref}
              supported={winnerIsKodik || displaySource.format === "hls" || displaySource.format === "mp4"}
              hasTimes={hasSkipTimes || !wantTimes}
              hasNext={nextEpisode != null}
            />
          }
          // On a wide screen the panel fills the cell the video sizes (the
          // row's height is the picture's alone); stacked under it on a
          // phone or a portrait tablet, it gets a height of its own.
          className="max-h-[26rem] lg:absolute lg:inset-0 lg:max-h-none"
        />
        </div>
      </div>
    </div>
  );
}

/** The bit of the Document Picture-in-Picture API used here. */
interface DocumentPip {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

/** The page's styles, copied into the picture-in-picture window. */
function copyStylesInto(target: Document) {
  target.documentElement.className = document.documentElement.className;
  target.body.style.margin = "0";
  target.body.style.background = "#000";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      target.head.appendChild(style);
    } catch {
      // A stylesheet from another origin can't be read — link it instead.
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

/**
 * The player's own switches, under the episode and dub lists: skip the
 * opening, go on at the ending, start the next episode, resume where you
 * stopped. Each is remembered. They work through the provider's player API,
 * so on a player without one they sit greyed out with the reason.
 */
function PlayerPrefsBar({
  prefs,
  onToggle,
  supported,
  hasTimes,
  hasNext,
  locked = false,
}: {
  /** A guest: every switch shows a lock, and says why. */
  locked?: boolean;
  prefs: PlayerPrefs;
  onToggle: (key: keyof PlayerPrefs) => void;
  supported: boolean;
  hasTimes: boolean;
  hasNext: boolean;
}) {
  const t = useT();
  const items: Array<{ key: keyof PlayerPrefs; icon: typeof SkipForwardIcon; label: string; hint: string }> = [
    { key: "skipOpening", icon: FastForwardIcon, label: t("watch.pref.skipOpening"), hint: t("watch.pref.skipOpeningHint") },
    { key: "skipEnding", icon: ListEndIcon, label: t("watch.pref.skipEnding"), hint: t("watch.pref.skipEndingHint") },
    { key: "autoNext", icon: SkipForwardIcon, label: t("watch.pref.autoNext"), hint: t("watch.pref.autoNextHint") },
    { key: "resume", icon: HistoryIcon, label: t("watch.pref.resume"), hint: t("watch.pref.resumeHint") },
  ];
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-1">
        {items.map(({ key, icon: Icon, label, hint }) => {
          const on = prefs[key];
          const off = locked || !supported || (key === "autoNext" && !hasNext);
          if (locked) return <MemberFeature key={key} label={label} className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border/40 px-2 text-[11px] text-muted-foreground hover:border-primary/40" />;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-disabled={off}
                  onClick={() => !off && onToggle(key)}
                  className={cn(
                    "flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                    off
                      ? "cursor-not-allowed border-border/40 text-muted-foreground/50"
                      : on
                        ? "border-primary/50 bg-primary/12 text-foreground"
                        : "border-border/60 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-3.5 shrink-0", on && !off && "text-primary")} />
                  <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                  {locked ? (
                    <LockIcon className="size-3 shrink-0 text-primary/70" />
                  ) : (
                    <span className={cn("size-1.5 shrink-0 rounded-full", on && !off ? "bg-primary" : "bg-foreground/20")} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-60">
                {locked ? "Доступно после входа — бесплатно" : supported ? hint : t("watch.pref.unsupported")}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {supported && (prefs.skipOpening || prefs.skipEnding) && !hasTimes && (
        <p className="px-1 text-[10px] leading-snug text-muted-foreground">{t("watch.pref.noTimes")}</p>
      )}
    </div>
  );
}
const SKIN_KEY = "as:player-skin";

/**
 * How our own player is dressed.
 *
 * Three takes on the same site, not three unrelated themes: the shadow is
 * the plain dark gradient every video player uses, the glass is the
 * translucent blurred surface the rest of the site is built from, and the
 * accent one carries the site colour into the bar itself. What they never
 * do is look like the provider's player — that was the point of writing
 * our own.
 */
export type PlayerSkin = "shadow" | "glass" | "accent";
export { sourceUrlFor };

const SKINS: Record<
  PlayerSkin,
  { bar: string; button: string; range: string; fill: string }
> = {
  shadow: {
    bar: "bg-gradient-to-t from-black/90 via-black/45 to-transparent]",
    button: "text-white/90 hover:bg-primary/25 hover:text-white",
    range: "[&_[data-slot=slider-range]]:bg-primary",
    fill: "linear-gradient(90deg, color-mix(in srgb, var(--primary) 70%, #a855f7), var(--primary))",
  },
  glass: {
    bar: "bg-black/70 border-t border-white/15",
    button: "text-white/90 hover:bg-white/20 hover:text-white",
    range: "[&_[data-slot=slider-range]]:bg-white",
    fill: "#ffffff",
  },
  accent: {
    bar: "bg-gradient-to-t from-[var(--accent)]/85 via-[var(--accent)]/35 to-transparent]",
    button: "text-white hover:bg-white/25",
    range: "[&_[data-slot=slider-range]]:bg-white",
    fill: "#ffffff",
  },
};

function readSkin(): PlayerSkin {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (stored === "shadow" || stored === "glass" || stored === "accent") return stored;
  } catch {
    // Private browsing, blocked storage — fall through to the default.
  }
  return "shadow";
}

/** Where this title's preferred dub is remembered. */
function dubKey(animeId: number): string {
  return `as:dub:${animeId}`;
}

/**
 * The dub this viewer marked as their favourite for this title, by name.
 *
 * By name rather than by source id on purpose: the same studio's dub
 * arrives under a different id from each provider and can be re-keyed
 * between resolves, but "AniLibria" is "AniLibria" whichever route it came
 * down. The preference is about the dub, not about the row that carried it.
 */
function readFavouriteDub(animeId: number): string | null {
  try {
    return localStorage.getItem(dubKey(animeId));
  } catch {
    return null;
  }
}

function readWorkingDub(animeId: number): string | null {
  try { return localStorage.getItem(`as:last-working:${animeId}`); } catch { return null; }
}


/**
 * Which sources we actually drive. A direct stream plays in our own picture
 * — with seeking, speed, volume and keyboard — while an embed brings its own
 * player and its own everything. That is a real difference to a viewer
 * choosing between two dubs, and it used to be invisible.
 */
/** Compact engine picker; unavailable alternatives stay visible and disabled. */
function PlayerSwitch({ useOwn, canUseOwn, canUseProvider, onChange }: {
  useOwn: boolean; canUseOwn: boolean; canUseProvider: boolean; onChange: (own: boolean) => void;
}) {
  return (
    <Select value={useOwn ? "own" : "kodik"} onValueChange={(value) => onChange(value === "own")}>
      <SelectTrigger aria-label="Выбрать плеер" className="h-9 w-30 max-w-full shrink-0 gap-1 bg-primary/5 px-2 text-[11px] sm:w-auto sm:gap-2 sm:text-xs">
        {useOwn && <LogoGlyph className="size-4 text-primary" />}
        <SelectValue>{useOwn ? "Свой плеер" : "Kodik Player"}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-w-[calc(100vw-2rem)]">
        <SelectGroup>
          <SelectItem value="own" disabled={!canUseOwn} textValue="Свой плеер · AnimeShadow">
            <span className="flex items-center gap-2"><LogoGlyph className="size-4 text-primary" />Свой плеер · AnimeShadow</span>
          </SelectItem>
          <SelectItem value="kodik" disabled={!canUseProvider}>Kodik Player</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function sourceLabel(source: WatchSource): string {
  return dubName(source.title);
}
