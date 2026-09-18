import { useEffect, useRef, useState } from "react";
import { useAnimeOpening } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * A title's opening, played as background motion behind a poster or a hero.
 *
 * These files are the reason this component is careful rather than a bare
 * <video>: they run 30-60MB. The server serves them with range support, so a
 * few seconds of playback only costs a few seconds of file — but only if
 * nothing ever loads one speculatively. So: nothing is fetched until the
 * caller says this one is genuinely wanted, exactly one plays at a time
 * across the whole page, and a visitor who is on a metered connection, has
 * asked for less motion, or is on a touch device (where there is no hover to
 * preview with) never downloads a byte.
 */

/** Only one opening is ever allowed to play. The newest claim wins, and the
 *  previous holder is told to stand down — sweeping a grid of cards must not
 *  leave a trail of videos playing behind the cursor. */
let currentHolder: symbol | null = null;
const listeners = new Map<symbol, () => void>();

function claimPlayback(id: symbol): void {
  if (currentHolder === id) return;
  const previous = currentHolder;
  currentHolder = id;
  if (previous) listeners.get(previous)?.();
}

function releasePlayback(id: symbol): void {
  if (currentHolder === id) currentHolder = null;
}

/**
 * Whether this device should be playing background video at all. Checked once
 * per mount rather than watched — none of these change mid-hover in practice,
 * and a listener per card is exactly the kind of cost this is trying to avoid.
 */
function shouldAllowMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  // No hover means no hover preview; on a phone this would be a 30MB download
  // triggered by a tap that was meant to open the page.
  if (!window.matchMedia?.("(hover: hover)").matches) return false;

  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /2g|3g/.test(connection.effectiveType)) return false;
  return true;
}

export function OpeningVideo({
  animeId,
  /** The caller's decision that this one is wanted now — a settled hover, or
   *  the slide currently on screen. Nothing loads while this is false. */
  active,
  className,
}: {
  animeId: number;
  active: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tokenRef = useRef<symbol>(Symbol("opening"));
  const [allowed] = useState(shouldAllowMotion);
  const [playing, setPlaying] = useState(false);

  const { data: opening } = useAnimeOpening(animeId, allowed && active);

  useEffect(() => {
    const token = tokenRef.current;
    const video = videoRef.current;
    if (!video || !opening || !active) return;

    claimPlayback(token);
    // Told to stand down by a newer claim: stop, and give the bytes back by
    // detaching the source rather than leaving a paused stream buffering.
    listeners.set(token, () => {
      video.pause();
      setPlaying(false);
    });

    void video.play().catch(() => undefined);

    return () => {
      listeners.delete(token);
      releasePlayback(token);
      video.pause();
      setPlaying(false);
    };
  }, [opening, active]);

  if (!allowed || !active || !opening) return null;

  return (
    <video
      ref={videoRef}
      src={opening.url}
      // `none`, emphatically: the browser must not touch the network until
      // play() is called on it.
      preload="none"
      muted
      loop
      playsInline
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      className={cn(
        "size-full object-cover transition-opacity duration-500",
        playing ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
