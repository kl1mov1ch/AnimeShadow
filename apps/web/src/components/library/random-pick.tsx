import type { LibraryEntry } from "@animeshadow/shared";
import { DicesIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { STATUS_META } from "./library-meta";

/** Ticks of the shuffle, each a little slower — a wheel running down. */
const SPIN_DELAYS = [60, 60, 70, 80, 90, 110, 130, 160, 200, 250, 320];

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * "What should I watch?" — picks from the plan-to-watch list when there is
 * one (that list exists for exactly this question), otherwise from whatever
 * the page is currently showing.
 */
export function RandomPick({ planned, shown }: { planned: LibraryEntry[]; shown: LibraryEntry[] }) {
  const t = useT();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<LibraryEntry | null>(null);
  const [spinning, setSpinning] = useState(false);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const pool = planned.length > 0 ? planned : shown;
  const source =
    planned.length > 0
      ? t("library.random.fromPlanned", { count: planned.length })
      : t("library.random.fromShown", { count: shown.length });

  const clear = () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const spin = () => {
    clear();
    if (pool.length === 0) return;
    const pick = () => pool[Math.floor(Math.random() * pool.length)] as LibraryEntry;
    if (pool.length === 1 || reducedMotion()) {
      setCurrent(pick());
      return;
    }
    setSpinning(true);
    let elapsed = 0;
    SPIN_DELAYS.forEach((delay, i) => {
      elapsed += delay;
      timers.current.push(
        setTimeout(() => {
          setCurrent((prev) => {
            // Never the same poster twice in a row, or the wheel looks stuck.
            let next = pick();
            for (let tries = 0; next === prev && tries < 5; tries++) next = pick();
            return next;
          });
          if (i === SPIN_DELAYS.length - 1) setSpinning(false);
        }, elapsed),
      );
    });
  };

  return (
    <>
      <Button
        variant="outline"
        className="h-10 rounded-full bg-card/70"
        onClick={() => {
          setOpen(true);
          spin();
        }}
        disabled={pool.length === 0}
      >
        <DicesIcon className="size-4" />
        <span className="hidden sm:inline">{t("library.random.button")}</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) clear();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DicesIcon className="size-5 text-primary" />
              {t("library.random.title")}
            </DialogTitle>
            <DialogDescription>{pool.length > 0 ? source : t("library.random.empty")}</DialogDescription>
          </DialogHeader>

          {current && (
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  "relative aspect-[2/3] w-40 overflow-hidden rounded-xl bg-muted shadow-xl ring-1 ring-border/60 transition-transform duration-150",
                  spinning ? "scale-95 blur-[1px]" : "animate-in zoom-in-90 scale-100",
                )}
              >
                {current.anime.imageUrl ? (
                  <img
                    key={current.anime.id}
                    src={imageSrc(current.anime.imageUrl)}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <PosterFallback title={labels.title(current.anime)} seed={current.anime.id} />
                )}
              </div>
              <div className={cn("flex flex-col items-center gap-1 text-center transition-opacity", spinning && "opacity-40")}>
                <p className="line-clamp-2 font-display text-lg leading-tight">{labels.title(current.anime)}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-1.5 rounded-full", STATUS_META[current.status].dot)} />
                  {[
                    labels.typeLabel(current.anime.type),
                    current.anime.year,
                    labels.episodeLabel(current.anime.episodes, current.anime.type),
                    current.anime.score?.toFixed(1),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {!spinning && current.anime.synopsis && (
                  <p className="animate-in fade-in line-clamp-3 text-xs leading-relaxed text-muted-foreground/90">
                    {current.anime.synopsis}
                  </p>
                )}
              </div>
              <div className="flex w-full gap-2">
                <Button variant="outline" className="flex-1" onClick={spin} disabled={spinning}>
                  <RefreshCwIcon className={cn("size-4", spinning && "animate-spin")} />
                  {t("library.random.again")}
                </Button>
                <Button asChild className="flex-1" disabled={spinning}>
                  <Link to={animeHref(current.anime)} onClick={() => setOpen(false)}>
                    <PlayIcon className="size-4" />
                    {t("library.random.open")}
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
