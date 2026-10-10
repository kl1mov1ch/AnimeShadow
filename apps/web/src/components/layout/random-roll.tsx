import type { AnimeSummary } from "@animeshadow/shared";
import { PlayIcon, ShuffleIcon, StarIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** One poster in the strip, and the gap after it, in px. */
const CELL = 84;
const GAP = 8;
/** How long the strip runs before it settles. */
const SPIN_MS = 2600;
/** Times the strip repeats before the pick, so it has room to gather speed. */
const LAPS = 3;

/**
 * Waits (briefly) for the posters to be in the browser's cache, the pick
 * first of all — a strip that lands on an empty frame is no reveal.
 */
function preload(roll: Roll, timeoutMs: number): Promise<boolean> {
  const load = (anime: AnimeSummary) =>
    new Promise<boolean>((resolve) => {
      const src = imageSrc(anime.imageUrl);
      if (!src) return resolve(false);
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  const pick = load(roll.pick);
  roll.reel.forEach((anime) => void load(anime));
  // True unless the pick's poster is known to be broken; still loading at
  // the deadline counts as fine — it will arrive while the strip spins.
  return Promise.race([pick, new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs))]);
}

interface Roll {
  pick: AnimeSummary;
  reel: AnimeSummary[];
}

/**
 * "Random anime" in the header, as a roulette: a strip of posters spins
 * past a marker, slows down and stops on the pick, which then shows under
 * it — with a button to watch it, or to spin again. Only titles that can
 * be played here come up.
 */
export function RandomRoll({ className }: { className?: string }) {
  const t = useT();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [phase, setPhase] = useState<"loading" | "spinning" | "done" | "error">("loading");
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const spin = useCallback(async () => {
    const id = ++run.current;
    setPhase("loading");
    setAnimate(false);
    setOffset(0);
    try {
      // A pick whose poster turns out to be missing is rolled again (twice at
      // most): landing on an empty frame is no reveal.
      let next = await apiRequest<Roll>("/anime/roll");
      for (let tries = 0; tries < 2; tries++) {
        if (id !== run.current) return;
        if (await preload(next, 1500)) break;
        next = await apiRequest<Roll>("/anime/roll");
      }
      if (id !== run.current) return;
      setRoll(next);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setPhase("done");
        return;
      }
      setPhase("spinning");
      // Two frames: the strip is drawn at rest first, then sent on its way,
      // so the transition actually runs.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (id !== run.current) return;
          const width = windowRef.current?.clientWidth ?? 320;
          const target = LAPS * next.reel.length + next.reel.length - 1;
          setAnimate(true);
          setOffset(target * (CELL + GAP) - (width / 2 - CELL / 2));
        }),
      );
    } catch {
      if (id === run.current) setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (open) void spin();
    else run.current += 1;
  }, [open, spin]);

  // The pick is the last of the laps; a few more follow it, so the strip
  // doesn't end at the marker.
  const strip = roll ? [...Array.from({ length: LAPS + 1 }, () => roll.reel).flat(), ...roll.reel.slice(0, 4)] : [];
  const pick = roll?.pick;
  const facts = pick
    ? [
        labels.typeLabel(pick.type),
        pick.year ? String(pick.year) : null,
        pick.episodes && pick.episodes > 1 ? t("watch.episodesCount", { count: pick.episodes }) : null,
      ].filter(Boolean)
    : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("footer.randomAnime")}
          title={t("footer.randomAnime")}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground data-[state=open]:bg-foreground/[0.06] data-[state=open]:text-foreground",
            className,
          )}
        >
          <ShuffleIcon className={cn("size-[18px] transition-transform duration-500", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={8}
        className="w-[min(22rem,calc(100vw-1rem))] overflow-hidden p-0"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="text-sm font-semibold">{t("roll.title")}</span>
          <span className="text-xs text-muted-foreground">{t("roll.hint")}</span>
        </div>

        {/* The strip, with a marker at its middle. */}
        <div ref={windowRef} className="relative h-[136px] overflow-hidden border-y border-border/60 bg-background/60">
          <div
            className="absolute top-2.5 flex"
            style={{
              gap: GAP,
              transform: `translateX(${-offset}px)`,
              transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.16, 1)` : "none",
              paddingLeft: 0,
            }}
            onTransitionEnd={() => setPhase("done")}
          >
            {strip.map((anime, i) => (
              <img
                key={`${anime.id}-${i}`}
                src={imageSrc(anime.imageUrl)}
                alt=""
                draggable={false}
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
                className="h-[116px] shrink-0 rounded-lg bg-muted object-cover"
                style={{ width: CELL }}
              />
            ))}
          </div>
          {/* Shade at both ends and a frame round the middle, where it lands. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-popover to-transparent" />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-popover to-transparent" />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1.5 h-[124px] rounded-xl border-2 transition-colors duration-300",
              phase === "done" ? "border-primary" : "border-foreground/40",
            )}
            style={{ width: CELL + 8, left: `calc(50% - ${(CELL + 8) / 2}px)` }}
          />
          {phase === "loading" && (
            <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">{t("roll.loading")}</span>
          )}
          {phase === "error" && (
            <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">{t("roll.error")}</span>
          )}
        </div>

        <div className="flex min-h-[7.5rem] flex-col gap-3 p-4">
          {phase === "done" && pick ? (
            <div className="flex animate-in flex-col gap-3 duration-300 fade-in-0 slide-in-from-bottom-1">
              <div className="min-w-0">
                <Link
                  to={animeHref(pick)}
                  onClick={() => setOpen(false)}
                  className="line-clamp-2 font-semibold leading-snug transition-colors hover:text-foreground/80"
                >
                  {labels.title(pick)}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {pick.score != null && (
                    <span className="inline-flex items-center gap-1 text-foreground/85">
                      <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                      {pick.score.toFixed(1)}
                    </span>
                  )}
                  {facts.join(" · ")}
                </p>
                {pick.genres.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground/80">
                    {pick.genres.slice(0, 3).map((g) => labels.genreLabel(g)).join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  to={`${animeHref(pick)}#watch`}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <PlayIcon className="size-4 fill-current" />
                  {t("roll.watch")}
                </Link>
                <button
                  type="button"
                  onClick={() => void spin()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/25 hover:text-foreground"
                >
                  <ShuffleIcon className="size-4" />
                  {t("roll.again")}
                </button>
              </div>
            </div>
          ) : (
            <p className="m-auto text-center text-xs text-muted-foreground">
              {phase === "spinning" ? t("roll.spinning") : phase === "error" ? "" : t("roll.loading")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
