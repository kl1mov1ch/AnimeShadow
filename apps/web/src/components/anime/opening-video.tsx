import { useEffect, useRef, useState } from "react";
import { isSlowConnection } from "@/lib/connection";
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

/**
 * Only one opening plays at a time, and the claims form a stack rather than a
 * single slot.
 *
 * A single slot was wrong in the obvious case: the hero is playing, the
 * cursor settles on a card, the card takes over — and when the cursor leaves,
 * the hero stays dead, because nothing ever handed playback back. A stack
 * suspends the interrupted holder and resumes it the moment the one on top
 * goes away.
 */
interface Holder {
  id: symbol;
  pause: () => void;
  resume: () => void;
}

const stack: Holder[] = [];

function claimPlayback(holder: Holder): void {
  const top = stack.at(-1);
  if (top?.id === holder.id) return;
  top?.pause();
  // Re-claiming from lower in the stack moves it to the top rather than
  // sitting in it twice.
  const existing = stack.findIndex((h) => h.id === holder.id);
  if (existing >= 0) stack.splice(existing, 1);
  stack.push(holder);
}

function releasePlayback(id: symbol): void {
  const wasTop = stack.at(-1)?.id === id;
  const index = stack.findIndex((h) => h.id === id);
  if (index >= 0) stack.splice(index, 1);
  if (wasTop) stack.at(-1)?.resume();
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

  // Shared with the rest of the site now, so "too slow for extras" means the
  // same thing everywhere instead of being decided three different ways.
  return !isSlowConnection();
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

    claimPlayback({
      id: token,
      // Told to stand down by a newer claim — paused, not torn down, so
      // resuming costs nothing and picks up where it left off.
      pause: () => {
        video.pause();
        setPlaying(false);
      },
      resume: () => {
        void video.play().catch(() => undefined);
      },
    });

    void video.play().catch(() => undefined);

    return () => {
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
