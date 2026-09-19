import { MusicIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { audioSrc } from "@/lib/format";
import { useAnimeThemes } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * How long a proxied track may take to start before the player gives up on
 * the proxy. The proxy's own upstream timeout is 20s — far too long to sit
 * in silence after pressing play.
 */
const PROXY_STALL_MS = 7_000;

/**
 * Set once the proxy has failed on this page load. On a server that cannot
 * reach the archive it will fail for every track, so the rest go straight to
 * the direct file instead of each waiting to fail first.
 */
let proxyFailed = false;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Bars that follow the actual music, drawn behind the featured track.
 *
 * This reads real frequency data rather than animating on a timer, which is
 * only possible because the audio comes through our own proxy: AnimeThemes
 * serves it without CORS, and Web Audio refuses to analyse a cross-origin
 * stream — it hands back silence and, in most browsers, mutes the element
 * along with it.
 *
 * `createMediaElementSource` can only ever be called once per element, so the
 * node is built on first play and kept for the life of the component.
 */
function useVisualiser(audioRef: React.RefObject<HTMLAudioElement | null>, active: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
  } | null>(null);
  const frameRef = useRef<number>(0);

  const start = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || graphRef.current) return;
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      // Still has to reach the speakers — an analyser is a tap, not a sink.
      analyser.connect(ctx.destination);
      graphRef.current = { ctx, analyser };
    } catch {
      // No Web Audio, or the element was already tapped. The player keeps
      // working; it just does not draw.
    }
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const graph = graphRef.current;
    if (!canvas || !graph || !active) return;

    if (graph.ctx.state === "suspended") void graph.ctx.resume();

    const bins = new Uint8Array(graph.analyser.frequencyBinCount);
    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      graph.analyser.getByteFrequencyData(bins);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * dpr;
      const height = canvas.clientHeight * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx2d.clearRect(0, 0, width, height);

      // The title's own colour, read off the element so the canvas follows
      // the page's palette instead of hard-coding one.
      ctx2d.fillStyle =
        getComputedStyle(canvas).getPropertyValue("color") || "#888";

      // The top bins are mostly empty on music; using the lower two thirds
      // keeps the bars lively rather than flat on the right.
      const used = Math.floor(bins.length * 0.66);
      const gap = 2 * dpr;
      const barWidth = Math.max(1, width / used - gap);
      for (let i = 0; i < used; i++) {
        const value = (bins[i] ?? 0) / 255;
        const barHeight = Math.max(2 * dpr, value * height);
        const x = i * (barWidth + gap);
        ctx2d.globalAlpha = 0.18 + value * 0.5;
        ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
      }
    };
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [active]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    void graphRef.current?.ctx.close().catch(() => undefined);
    graphRef.current = null;
  }, []);

  // Tearing down the context on unmount, or a page full of visits leaks one
  // AudioContext each — browsers cap how many may exist at once.
  useEffect(() => stop, [stop]);

  return { canvasRef, start, stop };
}

/**
 * Every theme the title has, as a small library: the one playing takes the
 * stage, the rest wait in a scrollable column beside it.
 *
 * Streamed, never offered as a file. These are commercial recordings, and
 * handing over a copy is a different act from letting someone hear the music
 * on the page they are already reading.
 */
export function ThemePlayer({ animeId }: { animeId: number }) {
  const t = useT();
  const { data } = useAnimeThemes(animeId);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  // While the thumb is held the bar follows the finger, not the audio —
  // otherwise every timeupdate yanks it back out from under you.
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  // Direct: the file straight from the archive rather than through our proxy.
  // It always plays — media loads without CORS — but Web Audio cannot read
  // it, so the bars fall back to a plain animation.
  const [direct, setDirect] = useState(proxyFailed);
  const wantPlay = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { canvasRef, start: startVisualiser, stop: stopVisualiser } = useVisualiser(
    audioRef,
    playing && !direct,
  );

  const fallBackToDirect = useCallback(() => {
    if (stallTimer.current) clearTimeout(stallTimer.current);
    proxyFailed = true;
    // The old element is wired into the audio graph; a no-CORS stream through
    // it would play as silence. The graph goes, and a fresh element (keyed on
    // `direct` below) takes over.
    stopVisualiser();
    setDirect(true);
  }, [stopVisualiser]);

  // The fresh element picks up where the failed one was asked to be.
  useEffect(() => {
    if (direct && wantPlay.current) {
      void audioRef.current?.play().catch(() => undefined);
    }
  }, [direct]);

  useEffect(
    () => () => {
      if (stallTimer.current) clearTimeout(stallTimer.current);
    },
    [],
  );

  const watchForStall = () => {
    if (direct) return;
    if (stallTimer.current) clearTimeout(stallTimer.current);
    stallTimer.current = setTimeout(() => {
      const audio = audioRef.current;
      // HAVE_FUTURE_DATA: enough to be playing. Anything less after this
      // long means the proxy is not delivering.
      if (wantPlay.current && audio && audio.readyState < 3) fallBackToDirect();
    }, PROXY_STALL_MS);
  };

  // Only the ones with an actual audio track: the video exists far more often
  // than the separate .ogg does, and a row that cannot play is worse than no
  // row at all.
  const tracks = (data?.tracks ?? []).filter((track) => track.audioUrl);

  // A new title must not keep the previous one's music playing underneath it.
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
  }, [animeId]);

  if (tracks.length === 0) return null;

  const current = tracks[index] ?? tracks[0]!;

  const playAt = (next: number) => {
    // Wraps both ways, so skipping never dead-ends on the last one.
    const wrapped = (next + tracks.length) % tracks.length;
    if (!direct) startVisualiser();
    if (wrapped === index) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        wantPlay.current = true;
        watchForStall();
        void audio.play().catch(() => undefined);
      } else {
        wantPlay.current = false;
        audio.pause();
      }
      return;
    }
    wantPlay.current = true;
    watchForStall();
    setIndex(wrapped);
    setPosition(0);
    setDuration(0);
    // The <audio> src changes on the next render, so play() waits for it.
    queueMicrotask(() => void audioRef.current?.play().catch(() => undefined));
  };

  const shown = scrubbing ?? position;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <div className="flex items-center gap-2">
        <MusicIcon className="size-4 text-[var(--accent-ink)]" />
        <span className="text-xs font-medium text-muted-foreground/70">
          {t("detail.soundtrack.title")}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/60">
          {tracks.length}
        </span>
      </div>

      {/* One on stage, the rest in a column beside it. */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-3">
          {/* The bars sit behind the controls, bottom-anchored, and inherit
              the title's colour through `text-` rather than a literal. */}
          <canvas
            ref={canvasRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-[var(--accent-ink)] opacity-70",
              direct && "hidden",
            )}
          />
          {direct && playing && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 bottom-0 flex h-12 items-end gap-[3px] opacity-25"
            >
              {Array.from({ length: 28 }, (_, bar) => (
                <span
                  key={bar}
                  className="equaliser-bar flex-1 rounded-t-sm bg-[var(--accent-ink)]"
                  style={{ animationDelay: `${(bar * 97) % 900}ms` }}
                />
              ))}
            </span>
          )}

          <div className="relative flex flex-col gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                {current.slug}
              </span>
              <span className="truncate text-base font-medium">
                {current.song ?? current.slug}
              </span>
              {current.artist && (
                <span className="truncate text-xs text-muted-foreground">
                  {current.artist}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => playAt(index - 1)}
                aria-label={t("common.previous")}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <SkipBackIcon className="size-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={() => playAt(index)}
                aria-label={
                  playing ? t("detail.soundtrack.pause") : t("detail.soundtrack.play")
                }
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent-ink)] text-background shadow-lg transition-transform duration-200 hover:scale-105"
              >
                {playing ? (
                  <PauseIcon className="size-5 fill-current" />
                ) : (
                  <PlayIcon className="size-5 translate-x-[1px] fill-current" />
                )}
              </button>
              <button
                type="button"
                onClick={() => playAt(index + 1)}
                aria-label={t("common.next")}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <SkipForwardIcon className="size-4 fill-current" />
              </button>

              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/70">
                {formatTime(shown)}
              </span>
              {/* A real range input rather than a div with a click handler:
                  it drags, it takes arrow keys, and it is announced. */}
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={shown}
                onChange={(e) => setScrubbing(Number(e.target.value))}
                onPointerUp={() => {
                  if (scrubbing != null && audioRef.current) {
                    audioRef.current.currentTime = scrubbing;
                    setPosition(scrubbing);
                  }
                  setScrubbing(null);
                }}
                onKeyUp={() => {
                  if (scrubbing != null && audioRef.current) {
                    audioRef.current.currentTime = scrubbing;
                    setPosition(scrubbing);
                  }
                  setScrubbing(null);
                }}
                aria-label={t("detail.soundtrack.seek")}
                className="theme-scrubber min-w-0 flex-1"
                style={{
                  ["--played" as string]: `${duration > 0 ? (shown / duration) * 100 : 0}%`,
                }}
              />
              <span className="w-9 shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        {/* The queue. Capped and scrollable rather than growing the card —
            a long-running show can have a dozen of these. */}
        {tracks.length > 1 && (
          <div className="flex max-h-44 shrink-0 flex-col gap-1 overflow-y-auto pr-1 sm:w-56">
            {tracks.map((track, i) => {
              const isCurrent = i === index;
              return (
                <button
                  key={`${track.kind}-${track.slug}-${i}`}
                  type="button"
                  onClick={() => playAt(i)}
                  aria-current={isCurrent}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-200",
                    isCurrent
                      ? "bg-[var(--accent-surface-strong)]"
                      : "hover:bg-secondary/40",
                  )}
                >
                  <span
                    className={cn(
                      "w-9 shrink-0 rounded-full px-1 py-0.5 text-center text-[10px] font-semibold",
                      isCurrent
                        ? "bg-[var(--accent-ink)] text-background"
                        : "bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    {track.slug}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {track.song ?? track.slug}
                  </span>
                  {isCurrent && playing && (
                    <span aria-hidden className="flex h-3 shrink-0 items-end gap-[2px]">
                      {[0, 1, 2].map((bar) => (
                        <span
                          key={bar}
                          className="equaliser-bar w-[2px] rounded-full bg-[var(--accent-ink)]"
                          style={{ animationDelay: `${bar * 140}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <audio
        key={direct ? "direct" : "proxy"}
        ref={audioRef}
        src={direct ? (current.audioUrl ?? undefined) : audioSrc(current.audioUrl)}
        // Required for Web Audio to read the proxied stream — see the note in
        // audioSrc. Left off the direct file, which has no CORS headers and
        // would refuse to load at all with it.
        crossOrigin={direct ? undefined : "anonymous"}
        preload="none"
        onError={() => {
          if (!direct) fallBackToDirect();
        }}
        onPlaying={() => {
          if (stallTimer.current) clearTimeout(stallTimer.current);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        // Rolls into the next theme rather than stopping dead — the list is
        // meant to be listened through.
        onEnded={() => playAt(index + 1)}
      />
    </div>
  );
}
