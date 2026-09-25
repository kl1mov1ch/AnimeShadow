import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import {
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
  SkipForwardIcon,
  CheckIcon,
  PaletteIcon,
  SparklesIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { useWatchSession } from "@/hooks/use-watch-session";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useAnimeProgress, useUpdateProgress, useWatchSources } from "@/lib/query";
import { type EpisodeCatalog, episodesOf, formatClock, useEpisodeCatalog } from "@/lib/episodes";
import { PlayerSidePanel } from "@/components/anime/player-side-panel";
import { DrawnCheck, MorphIcon } from "@/components/ui/morph-icon";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WatchSectionProps {
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
}

/** Our own HLS player (AniLibria streams). Off: Kodik only. */
const OWN_PLAYER_ENABLED = false;

export function WatchSection({
  anime,
  title,
  active,
  episode,
  onEpisodeChange,
  onActivate,
}: WatchSectionProps) {
  const t = useT();
  // The embeds are not mounted until someone asks for them. Mounting them on
  // page open meant two full third-party players — their own scripts, ads and
  // trackers, easily megabytes — racing each other for bandwidth before the
  // visitor had scrolled anywhere near the player, which on a weak connection
  // was most of what made a title page slow. The source list itself (a few
  // KB from our own API) still loads up front, so the facade knows whether
  // there is anything to play.
  const [activated, setActivated] = useState(false);
  // Same route, different title: the component is reused, so the choice to
  // load a player on one page must not carry over to the next.
  useEffect(() => {
    setActivated(false);
  }, [anime.id]);
  const releaseDate = anime.airedFrom ? new Date(anime.airedFrom) : null;
  const notYetOut =
    anime.airing === "UPCOMING" &&
    releaseDate != null &&
    releaseDate.getTime() > Date.now();

  const { data: rawData, isPending } = useWatchSources(anime.id, active && !notYetOut);

  // Two players, and the viewer can always see which one they are on.
  //
  // Our own player (`CustomHlsPlayer`) needs a direct stream, which only a
  // source of format "hls" has — in practice an AniLibria release. The
  // rest is the provider's own page inside an iframe, with its interface
  // in it. They can't share one race: a race shows whichever answered
  // first, which would make "whose player am I looking at" a coin toss.
  // So the sources are split and only one side is ever handed to `Player`.
  //
  // Ours is preselected wherever it can play at all, and the switch stays
  // on screen either way — including on the titles where our side is
  // empty, where it shows as unavailable with the reason rather than
  // vanishing. A control that appears on some titles and not others is
  // harder to trust than one that is always there and sometimes greyed.
  //
  // For now the site plays Kodik only: our own player is switched off and
  // its switch hidden, so every title opens the same way. The code for it
  // stays; turning it back on is `OWN_PLAYER_ENABLED`.
  const ownSources = OWN_PLAYER_ENABLED ? (rawData?.sources.filter((s) => s.format === "hls") ?? []) : [];
  const providerSources = rawData?.sources.filter((s) => s.format !== "hls") ?? [];
  const canUseOwn = ownSources.length > 0;
  const [preferOwn, setPreferOwn] = useState(true);

  // Where this viewer left off, applied once per visit — and only if they
  // haven't picked an episode themselves in the meantime. It used to live
  // inside Player, which remounts whenever the viewer is moved between our
  // player and the provider's; every remount re-applied the saved episode
  // and threw away whatever had just been clicked, and so did a progress
  // request that simply answered after the click. A choice the viewer made
  // always outranks one we remembered for them.
  const { status: authStatus } = useAuth();
  const { data: progress } = useAnimeProgress(anime.id, authStatus === "authenticated");
  const chosenRef = useRef(false);
  useEffect(() => {
    chosenRef.current = false;
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
  const catalog = useEpisodeCatalog(anime.id);
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
  const ownHasEpisode = ownSources.some((s) => s.hlsEpisodes?.[String(episode)] != null);
  const useOwn = canUseOwn && preferOwn && ownHasEpisode;

  // A direct stream can be reachable from our server and not from the
  // viewer — AniLibria's CDN is blocked or throttled in some countries, and
  // what that looks like here is a request that never answers rather than
  // one that fails. Falling back to the provider when our side gives up is
  // the difference between "this title doesn't play" and a two-second
  // hiccup nobody notices. Their own click always wins afterwards: this
  // only fires while the preference is still the one we chose for them.
  const handleOwnFailed = () => setPreferOwn(false);
  const data = rawData
    ? { ...rawData, sources: useOwn ? ownSources : providerSources }
    : rawData;
  // Warm the TCP/TLS handshake for the top few candidate embeds the moment
  // we know them — that connection setup is otherwise dead time that only
  // starts once the iframe itself is in the DOM.
  usePreconnect(data?.sources);

  if (notYetOut && releaseDate) {
    return <Countdown target={releaseDate} />;
  }

  if (isPending && active) {
    return <PlayerShell frames={[]} loading />;
  }

  if (data?.available && data.sources.length > 0) {
    if (!activated) {
      return (
        <PlayerShell
          frames={facadeFrames(anime, catalog, episode)}
          label={t("watch.loadPlayer")}
          catalog={catalog}
          total={total}
          episode={episode}
          fallbackDuration={anime.duration}
          onActivate={(picked) => {
            if (picked != null) chooseEpisode(picked);
            setActivated(true);
            onActivate?.();
          }}
        />
      );
    }
    return (
      <Player
        // Remounting on the switch is the point: the race, the winner and
        // every player-local bit of state belong to one side or the other,
        // and carrying them across would mean showing the old picture while
        // the new one loads.
        key={useOwn ? "own" : "provider"}
        data={data}
        title={title}
        animeId={anime.id}
        episodesTotal={total > 0 ? total : null}
        catalog={catalog}
        runtime={anime.duration}
        episode={episode}
        onEpisodeChange={chooseEpisode}
        useOwn={useOwn}
        canUseOwn={canUseOwn && ownHasEpisode}
        canUseProvider={providerSources.length > 0}
        onUseOwnChange={setPreferOwn}
        onAllFailed={
          useOwn && providerSources.length > 0 ? handleOwnFailed : undefined
        }
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
  return out.slice(0, 8);
}

/** How long each frame holds before the next one dissolves in. */
const FACADE_FRAME_MS = 3_800;

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
          className="group relative -mx-5 block aspect-video overflow-hidden border bg-black sm:mx-0 sm:rounded-xl"
        >
          {usable.map((frame, i) => (
            <img
              key={frame}
              src={imageSrc(frame)}
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
            <span className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/25 via-primary/5 to-transparent" />
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
                  <span className="btn-sheen relative grid size-16 place-items-center rounded-full border border-primary/50 bg-primary text-primary-foreground shadow-2xl shadow-primary/40 transition-transform duration-300 group-hover:scale-110">
                    <PlayIcon className="size-7 translate-x-[2px] fill-current" />
                  </span>
                </span>
                <span className="rounded-lg border border-primary/30 bg-black/55 px-3 py-1 text-sm font-medium text-white backdrop-blur">
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

        <aside className="flex max-h-80 min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-card/40 lg:h-full lg:max-h-[34rem]">
          <div className="flex shrink-0 gap-1 border-b border-border/60 p-1">
            <span className="h-7 flex-1 rounded-lg bg-primary/15" />
            <span className="h-7 flex-1 rounded-lg bg-primary/5" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:thin]">
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
                            src={imageSrc(info.thumb)}
                            alt=""
                            loading="lazy"
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
const COMPLETE_AT = 0.8;

/**
 * Records roughly where a signed-in user left off on one episode — a
 * third-party embed is a page we can't read a seek position out of, so
 * this measures elapsed time the player was open on this episode instead,
 * added onto whatever was already stored for it. Flushes on visibility
 * hide, unmount and episode change, same triggers as useWatchSession.
 *
 * Once that total passes most of the title's runtime the episode marks
 * itself watched, which is the whole point of measuring: with an embed
 * nothing else will ever say "this one is finished", and ticking every
 * episode by hand is the kind of bookkeeping people simply stop doing.
 * Deliberately generous in one direction only — it can miss an episode
 * someone watched elsewhere, and it will not claim one they left running
 * for two minutes.
 */
function useEpisodeTracking({
  animeId,
  episode,
  seedPosition,
  active,
  runtime,
  alreadyDone,
}: {
  animeId: number;
  episode: number;
  seedPosition: number;
  active: boolean;
  /** The title's runtime string, for the "finished" threshold. */
  runtime: string | null;
  /** Already ticked — nothing here should re-send that. */
  alreadyDone: boolean;
}): void {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const update = useUpdateProgress(animeId);
  const baseRef = useRef(seedPosition);
  // Survives the flush closure, so an episode is only ever announced
  // finished once per visit to it.
  const doneRef = useRef(alreadyDone);
  useEffect(() => {
    doneRef.current = alreadyDone;
  }, [episode, alreadyDone]);

  useEffect(() => {
    baseRef.current = seedPosition;
  }, [episode, seedPosition]);

  useEffect(() => {
    if (!authed || !active) return;
    let start = Date.now();

    const minutes = runtimeMinutes(runtime);
    const completeAfter = minutes != null ? minutes * 60 * COMPLETE_AT : null;

    const flush = () => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      start = Date.now(); // reset so a resume doesn't double-count
      if (elapsed < 15) return;
      baseRef.current += elapsed;
      const finished =
        !doneRef.current &&
        completeAfter != null &&
        baseRef.current >= completeAfter;
      if (finished) doneRef.current = true;
      update.mutate(
        {
          episode,
          positionSeconds: baseRef.current,
          ...(finished ? { completed: true } : {}),
        },
        finished
          ? { onSuccess: () => toast.success(t("watch.autoMarked", { n: episode })) }
          : undefined,
      );
    };

    // Without waiting for a flush trigger: someone who watches an episode
    // straight through and then closes the tab should already be ticked by
    // the time they do, not ticked by the unload handler racing the close.
    const tick = completeAfter != null && !doneRef.current
      ? setInterval(flush, 60_000)
      : null;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else start = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", flush);

    return () => {
      flush();
      if (tick != null) clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, active, animeId, episode, runtime]);
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
    const key = `${source.kind}:${source.title.trim().toLowerCase()}`;
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
 * Either way, an episode we have no URL for falls back to one we do rather
 * than showing nothing.
 */
function sourceUrlFor(source: WatchSource, episode: number): string | null {
  if (source.format === "hls") {
    return (
      source.hlsEpisodes?.[String(episode)] ??
      Object.values(source.hlsEpisodes ?? {})[0] ??
      null
    );
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
const RESUME_TAIL_SECONDS = 60;

/**
 * The shape of every square button in the control bar. Only what all three
 * skins agree on — the colour half comes from the skin, because over a
 * video colour is the whole of what says this player is ours and not the
 * provider's. `group` is here so an icon inside can react to the hover.
 */
const CONTROL_BUTTON =
  "group flex size-8 items-center justify-center rounded-lg transition-all duration-200 active:scale-90";

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
  skin,
  isWinner,
  onReady,
  onFailed,
  resumeFrom = 0,
  onEnded,
  opening = null,
}: {
  src: string;
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
}) {
  const t = useT();
  const tone = SKINS[skin];
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
  useEffect(() => {
    resumeRef.current = resumeFrom;
  }, [resumeFrom]);
  const resumedSrcRef = useRef<string | null>(null);
  useEffect(() => {
    resumedSrcRef.current = null;
  }, [src]);

  const applyResume = () => {
    onReady();
    const video = videoRef.current;
    const at = resumeRef.current;
    if (!video || resumedSrcRef.current === src) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    resumedSrcRef.current = src;
    if (at >= RESUME_MIN_SECONDS && at <= duration - RESUME_TAIL_SECONDS) {
      video.currentTime = at;
    }
  };

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
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            const instance = new Hls({ enableWorker: true });
            instance.loadSource(src);
            instance.attachMedia(video);
            instance.on(Hls.Events.MANIFEST_PARSED, () => {
              // "Ready" as far as the race is concerned: the manifest is
              // parsed, so this source is real and answering. Waiting for
              // `canplay` (a buffered first segment) meant the race's stall
              // timer could retire a perfectly good stream mid-handshake and
              // fall back to an iframe — the reason the custom player kept
              // losing to Kodik on a slow first segment.
              onReady();
              resumeIfWinner();
            });
            instance.on(Hls.Events.ERROR, (_event, payload) => {
              // hls.js recovers from most errors by itself; only a fatal one
              // means this stream will not play in this browser. Reported at
              // once so the race moves on, and logged so a report of "the
              // custom player doesn't work here" has something behind it.
              if (!payload.fatal || cancelled) return;
              console.error(
                "[AnimeShadow] HLS fatal error",
                payload.type,
                payload.details,
              );
              onFailedRef.current();
            });
            hls = instance;
          } else {
            // No native support and hls.js says it can't help either — set it
            // anyway; a handful of very old browsers still get lucky.
            video.src = src;
            resumeIfWinner();
          }
        })
        .catch((error: unknown) => {
          // The chunk itself never arrived — offline, a stale service worker
          // still pointing at a filename the last deploy replaced, or an
          // extension blocking it. This path had no catch at all, so the
          // promise rejected silently and the player simply never reported
          // ready: the race sat out its full timeout and handed the slot to
          // an iframe. Safari never comes through here (it plays HLS
          // natively), which is exactly why the failure looked like "the
          // custom player only works in Safari" rather than a failed import.
          console.error("[AnimeShadow] hls.js failed to load", error);
          if (!cancelled) onFailedRef.current();
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
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
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
  }, [isWinner]);

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
      switch ((e.key ?? "").toLowerCase()) {
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
        // Both, deliberately: `loadedmetadata` is the earliest honest "this
        // stream answered" (and the only one the native-Safari path gets,
        // since it never goes through hls.js at all), `canplay` is the
        // backstop if a browser skips it. handleLoad ignores everything
        // after the first call, so firing twice costs nothing.
        onLoadedMetadata={applyResume}
        onCanPlay={applyResume}
        onEnded={() => onEndedRef.current?.()}
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
              className="group/play absolute inset-0 flex items-center justify-center"
            >
              {/* The site accent, not a grey disc: this is the one moment
                  the player is the whole screen, so it may as well look
                  like the rest of AnimeShadow. The ring behind it breathes,
                  so the button reads as waiting rather than parked. */}
              <span className="relative flex size-16 items-center justify-center">
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.6s] motion-reduce:hidden"
                />
                <span className="btn-sheen relative flex size-16 items-center justify-center rounded-full border border-primary/50 bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 backdrop-blur transition-transform duration-300 group-hover/play:scale-105 group-active/play:scale-95">
                  <PlayIcon className="size-7 translate-x-0.5 fill-current" />
                </span>
              </span>
            </button>
          )}

          {/* Offered only while the opening is actually on screen, and only
              where the provider marked it — a guessed skip that lands in the
              middle of a scene is worse than no button. */}
          {opening != null &&
            currentTime >= opening.start &&
            currentTime < opening.stop - 1 && (
              <button
                type="button"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime = opening.stop;
                  wake();
                }}
                className="btn-sheen absolute bottom-20 right-4 z-10 flex animate-in items-center gap-1.5 rounded-lg border border-white/25 bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition-all duration-200 fade-in-0 slide-in-from-right-4 hover:border-primary hover:bg-primary/80 active:scale-95"
              >
                <SkipForwardIcon className="size-3.5" />
                {t("watch.skipOpening")}
              </button>
            )}

          <div
            className={cn(
              // Slides down with the fade rather than only fading: the bar
              // belongs to the bottom edge, so leaving is a movement toward
              // it, the way every other panel on the site leaves.
              "absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-3 pb-2 pt-10 transition-all duration-300 ease-out",
              tone.bar,
              controlsVisible
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0",
            )}
          >
            <div className="group relative flex h-4 items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-white/35 transition-[width] duration-500 ease-out"
                  style={{ width: `${bufferedPct}%` }}
                />
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
                // The track thickens under the pointer: the one place an
                // extra pixel of height earns itself, since this is the
                // control people actually aim at.
                className={cn(
                  "relative [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:shadow-lg [&_[data-slot=slider-thumb]]:shadow-primary/40 [&_[data-slot=slider-thumb]]:transition-opacity [&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-track]]:transition-all group-hover:[&_[data-slot=slider-thumb]]:opacity-100 group-hover:[&_[data-slot=slider-track]]:h-1.5",
                  tone.range,
                )}
              />
            </div>

            <div className="flex items-center gap-0.5 text-white">
              <button
                type="button"
                onClick={togglePlay}
                aria-label={playing ? t("watch.pause") : t("watch.play")}
                className={cn(CONTROL_BUTTON, tone.button)}
              >
                <MorphIcon
                  on={playing}
                  off={PlayIcon}
                  onIcon={PauseIcon}
                  className="size-4 fill-current"
                />
              </button>
              <button
                type="button"
                onClick={() => skip(-SKIP_SECONDS)}
                aria-label={t("watch.skipBack")}
                className={cn(CONTROL_BUTTON, tone.button, "hidden sm:flex")}
              >
                <RotateCcwIcon className="size-4 transition-transform duration-300 group-hover:-rotate-45" />
              </button>
              <button
                type="button"
                onClick={() => skip(SKIP_SECONDS)}
                aria-label={t("watch.skipForward")}
                className={cn(CONTROL_BUTTON, tone.button, "hidden sm:flex")}
              >
                <RotateCwIcon className="size-4 transition-transform duration-300 group-hover:rotate-45" />
              </button>

              {/* Volume — a hover-reveal slider where hover exists at all; a
                  phone just gets the mute toggle (dragging a sliver-thin
                  slider on touch fights the page's own scroll gesture). */}
              <div className="group hidden items-center sm:flex">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted || volume === 0 ? t("watch.unmute") : t("watch.mute")}
                  className={cn(CONTROL_BUTTON, tone.button)}
                >
                  <MorphIcon
                    on={muted || volume === 0}
                    off={Volume2Icon}
                    onIcon={VolumeXIcon}
                    className="size-4"
                    spin="ccw"
                  />
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
                className={cn(CONTROL_BUTTON, tone.button, "sm:hidden")}
              >
                <MorphIcon
                  on={muted || volume === 0}
                  off={Volume2Icon}
                  onIcon={VolumeXIcon}
                  className="size-4"
                  spin="ccw"
                />
              </button>

              <span className="ml-1 shrink-0 font-display text-[11px] tabular-nums text-white/85">
                {formatTime(shownTime)}
                <span className="text-white/40"> / {formatTime(duration)}</span>
              </span>

              <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <Popover open={speedMenuOpen} onOpenChange={setSpeedMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("watch.speed")}
                      className={cn(
                        "flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors",
                        tone.button,
                        speedMenuOpen && "bg-primary/25 text-white",
                      )}
                    >
                      <GaugeIcon
                        className={cn(
                          "size-3.5 transition-transform duration-300",
                          speedMenuOpen && "rotate-180",
                        )}
                      />
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
                        {rate === speed && (
                          <DrawnCheck key={rate} className="size-3.5 text-primary" />
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {canPip && (
                  <button
                    type="button"
                    onClick={togglePip}
                    aria-label={t("watch.pip")}
                    className={cn(CONTROL_BUTTON, tone.button, "hidden sm:flex")}
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
  catalog,
  runtime,
  episode,
  onEpisodeChange,
  useOwn,
  canUseOwn,
  canUseProvider,
  onUseOwnChange,
  onAllFailed,
}: {
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
  /** Which of the two players is on screen — see WatchSection for the split. */
  useOwn: boolean;
  /** Is there a direct stream at all? Without one our side has nothing to play. */
  canUseOwn: boolean;
  canUseProvider: boolean;
  onUseOwnChange: (useOwn: boolean) => void;
  /** Every source on this side is dead — the other side is worth a try. */
  onAllFailed?: (() => void) | undefined;
}) {
  const t = useT();
  // Sources arrive ranked best-first (verified-reachable ones lead). Rather
  // than load one and wait to find out it's dead, load the top few at once,
  // invisibly, and show whichever answers first — the viewer never watches
  // a stall timer count down on a source that was going to fail anyway.
  // Except when the top pick is already confirmed reachable (see
  // initialRacePool) — then it's shown alone, trusted outright.
  const [favouriteDub, setFavouriteDub] = useState<string | null>(() =>
    readFavouriteDub(animeId),
  );
  const [racePool, setRacePool] = useState<string[]>(() =>
    initialRacePool(data.sources, readFavouriteDub(animeId)),
  );
  const [winnerId, setWinnerId] = useState<string | null>(null);
  // Every source this session has already raced and lost — so a handful of
  // dead mirrors don't leave the user staring at a spinner for minutes: we
  // keep pulling in fresh batches automatically and only ask them to pick
  // once nothing is left to try.
  const [triedIds, setTriedIds] = useState<string[]>([]);
  // How our own player is dressed. A real preference — someone who wants
  // the glass bar wants it on every episode — so unlike the old theatre
  // toggle this one is remembered.
  const [skin, setSkin] = useState<PlayerSkin>(() => readSkin());
  const setSkinPersisted = (next: PlayerSkin) => {
    setSkin(next);
    try {
      localStorage.setItem(SKIN_KEY, next);
    } catch {
      // Private browsing, blocked storage — it just won't stick.
    }
  };
  // Whether finishing an episode should load the next one. Remembered,
  // because that *is* a preference — and defaulting to on, since the whole
  // point of a series is that there is another one after this.
  const [autoNext, setAutoNext] = useState(() => readAutoNext());
  const setAutoNextPersisted = (value: boolean) => {
    setAutoNext(value);
    try {
      localStorage.setItem(AUTO_NEXT_KEY, value ? "1" : "0");
    } catch {
      // Private browsing, blocked storage — the preference just won't stick.
    }
  };

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
  const watchedEpisodes = useMemo(() => {
    const map = new Map<number, { completed: boolean; position: number }>();
    for (const row of progress?.episodes ?? []) {
      map.set(row.episode, { completed: row.completed, position: row.positionSeconds });
    }
    return map;
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
    runtime,
    alreadyDone: episodeRecord?.completed ?? false,
  });
  useWatchSession({ animeId, episode, active: watching });
  const update = useUpdateProgress(animeId);

  // Stall watch for the current race batch — cleared the instant any of them
  // loads. If the whole batch times out, retire it and pull the next one; a
  // shorter fuse each round, since by then we're already in "keep hunting"
  // mode and every extra second is one the first attempt already spent.
  // A direct HLS stream legitimately takes longer to answer than an iframe
  // — hls.js has to load, then fetch and parse the manifest — so judging
  // both on the same six-second fuse is what kept retiring a perfectly
  // good custom player in favour of an iframe that merely fired `onLoad`
  // sooner. Our own player gets a fuse long enough to actually finish.
  const hlsStallMs = 20_000;
  useEffect(() => {
    if (winnerId != null || racePool.length === 0) return;
    const poolHasHls = racePool.some(
      (id) => data.sources.find((s) => s.id === id)?.format === "hls",
    );
    const timeout = poolHasHls
      ? hlsStallMs
      : triedIds.length === 0
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
    const current = data.sources.find((s) => s.id === (winnerId ?? racePool[0]));
    if (!current) return;
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
    setWinnerId(null);
    setRacePool([id]);
  };

  /** Ticking an episode by hand — the counterpart to the automatic mark. */
  const toggleWatched = (n: number) => {
    const state = watchedEpisodes.get(n);
    update.mutate({
      episode: n,
      positionSeconds: state?.position ?? 0,
      completed: !(state?.completed ?? false),
    });
  };

  /** Star a dub, or un-star it — the same button both ways. */
  const toggleFavourite = (title: string) => {
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
    if (winnerId != null) return;
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
    setTriedIds([]);
    setWinnerId(null);
    setRacePool(initialRacePool(data.sources, favouriteDub));
  };



  return (
    <div
      ref={containerRef}
      className="flex w-full min-w-0 flex-col gap-2.5"
    >
      {/* Current pick, one line — the episode control lives right in it
          (only for signed-in viewers: nothing persists otherwise, so a
          control that quietly does nothing would just be confusing)
          instead of floating on its own row above the player. One card
          instead of bare text/buttons on the page background, so the whole
          row reads as a single control bar. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-sm">
        {canUseOwn && (
          <PlayerSwitch
            useOwn={useOwn}
            canUseOwn={canUseOwn}
            canUseProvider={canUseProvider}
            onChange={onUseOwnChange}
          />
        )}
        {/* What is on screen, by number and — where anyone has published
            one — by name. */}
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-display tabular-nums text-primary">
            {episode}
          </span>
          <span className="hidden min-w-0 truncate font-medium sm:inline">
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
          {/* Both of these only mean anything for our own player: a
              cross-origin embed brings its own everything and never tells us
              an episode ended. Rather than show dead controls, they appear
              only when the source in the picture is one we drive. */}
          {displaySource.format === "hls" && nextEpisode != null && (
            <button
              type="button"
              onClick={() => setAutoNextPersisted(!autoNext)}
              aria-pressed={autoNext}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                autoNext
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 bg-secondary/40 text-foreground/70 hover:text-foreground",
              )}
            >
              <MorphIcon
                on={autoNext}
                off={SkipForwardIcon}
                onIcon={CheckIcon}
                className="size-3.5"
              />
              <span className="hidden sm:inline">{t("watch.autoNext")}</span>
            </button>
          )}
          {displaySource.format === "hls" && (
            <SkinPicker skin={skin} onChange={setSkinPersisted} />
          )}
          {/* Kodik refuses some countries outright and says so inside its
              own frame, where we can't see it — so the explanation sits
              here, one hover away, for whoever gets that message. */}
          {displaySource.format !== "hls" && (
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
          <p className="text-sm text-muted-foreground">{t("watch.allFailedHint")}</p>
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
      <div
        className={cn(
          "relative aspect-video overflow-hidden border bg-black",
          "-mx-5 sm:mx-0 sm:rounded-xl",
        )}
      >
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
                skin={skin}
                isWinner={isWinner}
                onReady={() => handleLoad(id)}
                onFailed={() => handleFailed(id)}
                resumeFrom={episodeRecord?.positionSeconds ?? 0}
                onEnded={handleEnded}
                opening={source.episodeMeta?.[String(episode)]?.opening ?? null}
              />
            );
          }

          return (
            <iframe
              key={source.id}
              src={sourceUrlFor(source, episode) ?? source.embedUrl}
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

        <PlayerSidePanel
          total={episodesTotal ?? 0}
          episode={episode}
          onEpisodeChange={onEpisodeChange}
          catalog={catalog}
          fallbackDuration={runtime}
          currentEpisodes={episodesOf(displaySource)}
          watched={watchedEpisodes}
          canMark={authed}
          onToggleWatched={toggleWatched}
          sources={pickable}
          currentSourceId={displaySource.id}
          favouriteDub={favouriteDub}
          onPickSource={pick}
          onToggleFavourite={toggleFavourite}
          sourceLabel={(source) => sourceLabel(source, t)}
          // Capped rather than free: the aside is a flex column whose list
          // scrolls, but its *intrinsic* height is still the whole list, so
          // without a ceiling a 1200-episode show would set the row height
          // and leave the video floating in the middle of it. 34rem is
          // about where a 16:9 picture lands at this column split.
          className="max-h-80 lg:h-full lg:max-h-[34rem]"
        />
      </div>
    </div>
  );
}

const AUTO_NEXT_KEY = "as:auto-next";
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

const SKINS: Record<
  PlayerSkin,
  { bar: string; button: string; range: string }
> = {
  shadow: {
    bar: "bg-gradient-to-t from-black/90 via-black/45 to-transparent backdrop-blur-[2px]",
    button: "text-white/90 hover:bg-primary/25 hover:text-white",
    range: "[&_[data-slot=slider-range]]:bg-primary",
  },
  glass: {
    bar: "bg-black/25 backdrop-blur-xl border-t border-white/15",
    button: "text-white/90 hover:bg-white/20 hover:text-white",
    range: "[&_[data-slot=slider-range]]:bg-white",
  },
  accent: {
    bar: "bg-gradient-to-t from-[var(--accent)]/85 via-[var(--accent)]/35 to-transparent backdrop-blur-[2px]",
    button: "text-white hover:bg-white/25",
    range: "[&_[data-slot=slider-range]]:bg-white",
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

function readAutoNext(): boolean {
  try {
    return localStorage.getItem(AUTO_NEXT_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Which sources we actually drive. A direct stream plays in our own picture
 * — with seeking, speed, volume and keyboard — while an embed brings its own
 * player and its own everything. That is a real difference to a viewer
 * choosing between two dubs, and it used to be invisible.
 */
/**
 * Ours or theirs, as one segmented control above the picture.
 *
 * Deliberately not a dropdown: there are exactly two, the difference is
 * something a viewer feels immediately (our interface versus the
 * provider's), and switching back after trying one should cost a single
 * click in a place the eye already is.
 *
 * A side with nothing to play stays visible and goes unavailable, with the
 * reason on hover, rather than disappearing — otherwise the bar would
 * change shape from title to title and the control would be something you
 * have to go looking for.
 */
function PlayerSwitch({
  useOwn,
  canUseOwn,
  canUseProvider,
  onChange,
}: {
  useOwn: boolean;
  canUseOwn: boolean;
  canUseProvider: boolean;
  onChange: (useOwn: boolean) => void;
}) {
  const t = useT();
  const options = [
    {
      own: true,
      label: t("watch.playerOwn"),
      enabled: canUseOwn,
      why: t("watch.playerOwnUnavailable"),
    },
    {
      own: false,
      label: t("watch.playerProvider"),
      enabled: canUseProvider,
      why: t("watch.playerProviderUnavailable"),
    },
  ];
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/40 p-0.5">
      {options.map((option) => {
        const active = useOwn === option.own;
        return (
          <Tooltip key={String(option.own)}>
            <TooltipTrigger asChild>
              {/* The disabled half still has to answer a hover, and a
                  disabled button doesn't fire pointer events — so the
                  wrapper carries the tooltip and the button inside it goes
                  inert instead. */}
              <span className={cn(!option.enabled && "cursor-not-allowed")}>
                <button
                  type="button"
                  onClick={() => option.enabled && onChange(option.own)}
                  aria-pressed={active}
                  aria-disabled={!option.enabled}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                    !option.enabled
                      ? "pointer-events-none opacity-40"
                      : active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground active:scale-95",
                  )}
                >
                  {option.own && (
                    <SparklesIcon
                      className={cn(
                        "size-3 transition-transform duration-300",
                        active && "morph-pop",
                      )}
                    />
                  )}
                  {option.label}
                  {active && option.enabled && (
                    <DrawnCheck key={String(useOwn)} className="size-3" />
                  )}
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {option.enabled ? t(`watch.${option.own ? "playerOwnHint" : "playerProviderHint"}`) : option.why}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Three site-derived looks for our own player — see `SKINS`. */
function SkinPicker({
  skin,
  onChange,
}: {
  skin: PlayerSkin;
  onChange: (skin: PlayerSkin) => void;
}) {
  const t = useT();
  const options: PlayerSkin[] = ["shadow", "glass", "accent"];
  return (
    <span className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/40 p-0.5">
      <PaletteIcon className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={skin === option}
          title={t(`watch.skin.${option}`)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            skin === option
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`watch.skin.${option}`)}
        </button>
      ))}
    </span>
  );
}

function sourceLabel(source: WatchSource, t: ReturnType<typeof useT>): string {
  const parts = [source.title];
  if (source.episodesCount) {
    parts.push(t("watch.episodesCount", { count: source.episodesCount }));
  }
  if (source.quality) parts.push(source.quality);
  return parts.join(" · ");
}
