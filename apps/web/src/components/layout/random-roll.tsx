import type { AnimeSummary } from "@animeshadow/shared";
import { Loader2Icon, PlayIcon, ShuffleIcon, StarIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useHeaderOverlay } from "@/hooks/use-header-overlay";

interface Roll {
  pick: AnimeSummary;
}

/** Loads a poster; true once it is in the browser's cache, false if it is broken. */
function loadPoster(anime: AnimeSummary, timeoutMs: number): Promise<boolean> {
  const src = imageSrc(anime.imageUrl);
  if (!src) return Promise.resolve(false);
  return Promise.race([
    new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    }),
    // Still loading at the deadline counts as fine — it arrives in place.
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), timeoutMs)),
  ]);
}

/** One random title with a working player, its poster already loaded. */
async function drawOne(): Promise<AnimeSummary> {
  // A pick whose poster turns out to be missing is drawn again (twice at
  // most): an empty frame is no answer.
  let roll = await apiRequest<Roll>("/anime/roll", { query: { count: 1 } });
  for (let tries = 0; tries < 2; tries++) {
    if (await loadPoster(roll.pick, 1500)) break;
    roll = await apiRequest<Roll>("/anime/roll", { query: { count: 1 } });
  }
  return roll.pick;
}

/**
 * "Random anime" in the header: one card — the poster, the name, the score
 * and what it is — with "watch" and "another one". The next title is drawn
 * (and its poster loaded) in the background while this one is on screen,
 * so "another one" deals it at once, sliding in over the last.
 *
 * It used to be a slot-machine strip of sixty posters spinning for nearly
 * three seconds — fun once, heavy every time after, and slow on a phone.
 * Only titles that can be played here come up.
 */
export function RandomRoll({ className }: { className?: string }) {
  const t = useT();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  useHeaderOverlay(open);
  const [pick, setPick] = useState<AnimeSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [dealing, setDealing] = useState(false);
  const next = useRef<Promise<AnimeSummary> | null>(null);
  const run = useRef(0);

  const prepareNext = useCallback(() => {
    const promise = drawOne();
    // A failed draw in the background is retried when it is asked for.
    promise.catch(() => {
      if (next.current === promise) next.current = null;
    });
    next.current = promise;
  }, []);

  const deal = useCallback(async () => {
    const id = ++run.current;
    setDealing(true);
    try {
      const upcoming = next.current ?? drawOne();
      next.current = null;
      const anime = await upcoming;
      if (id !== run.current) return;
      setPick(anime);
      setState("ready");
      prepareNext();
    } catch {
      if (id === run.current) setState((s) => (s === "ready" ? s : "error"));
    } finally {
      if (id === run.current) setDealing(false);
    }
  }, [prepareNext]);

  useEffect(() => {
    if (open) {
      // A fresh title every time the card opens — never the last one again.
      if (pick == null) setState("loading");
      void deal();
    } else {
      run.current += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        className="flex w-[min(21rem,calc(100vw-1rem))] flex-col gap-3 p-3"
      >
        <div className="flex items-center justify-between px-0.5">
          <span className="text-sm font-semibold">{t("roll.title")}</span>
          <span className="text-[11px] text-muted-foreground">{t("roll.hint")}</span>
        </div>

        {state === "error" && pick == null ? (
          <p className="py-8 text-center text-xs text-muted-foreground">{t("roll.error")}</p>
        ) : pick == null ? (
          <div className="flex gap-3" aria-busy>
            <div className="aspect-[2/3] w-24 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ) : (
          <Link
            key={pick.id}
            to={animeHref(pick)}
            onClick={() => setOpen(false)}
            className="group flex animate-in gap-3 rounded-xl duration-300 fade-in-0 slide-in-from-right-4"
          >
            <img
              src={imageSrc(pick.imageUrl)}
              alt=""
              className="aspect-[2/3] w-24 shrink-0 rounded-lg bg-muted object-cover ring-1 ring-border/60"
            />
            <div className="flex min-w-0 flex-col gap-1.5 pt-0.5">
              <span className="line-clamp-3 text-sm font-semibold leading-snug transition-colors group-hover:text-foreground/80">
                {labels.title(pick)}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {pick.score != null && (
                  <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                    <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                    {pick.score.toFixed(1)}
                  </span>
                )}
                {facts.join(" · ")}
              </span>
              {pick.genres.length > 0 && (
                <span className="line-clamp-2 text-xs text-muted-foreground/80">
                  {pick.genres
                    .slice(0, 3)
                    .map((g) => labels.genreLabel(g))
                    .join(" · ")}
                </span>
              )}
            </div>
          </Link>
        )}

        <div className="flex gap-2">
          {pick ? (
            <Link
              to={`${animeHref(pick)}#watch`}
              onClick={() => setOpen(false)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PlayIcon className="size-4 fill-current" />
              {t("roll.watch")}
            </Link>
          ) : (
            <span className="h-10 flex-1 rounded-lg bg-muted/60" />
          )}
          <button
            type="button"
            onClick={() => void deal()}
            disabled={dealing && pick == null}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border/70 px-3.5 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-50"
          >
            {dealing ? <Loader2Icon className="size-4 animate-spin" /> : <ShuffleIcon className="size-4" />}
            {t("roll.again")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
