import type { AnimeSummary } from "@animeshadow/shared";
import { useState } from "react";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A poster that never shows a broken picture.
 *
 * Three states, not one. Until the file arrives the slot is a quiet
 * placeholder the same shape and colour as the card, so a grid mid-load
 * reads as a grid rather than as holes. If the file never arrives — a dead
 * CDN link, a title whose art was pulled upstream, a blocked host — it
 * falls through to the drawn fallback instead of the browser's own broken
 * icon and alt text, which is what the card used to show.
 *
 * A missing `imageUrl` was already handled; a URL that is present but does
 * not load was not, and that is the common case: the catalogue stores
 * whatever the provider said at import time, and those links rot.
 */
export function AnimePoster({
  anime,
  title,
  /** Prefer the small variant everywhere — slow links, dense grids. */
  small = false,
  priority = false,
  className,
}: {
  anime: Pick<AnimeSummary, "id" | "imageUrl" | "imageLargeUrl">;
  title: string;
  small?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(
    anime.imageUrl ? "loading" : "failed",
  );

  if (!anime.imageUrl || status === "failed") {
    return <PosterFallback title={title} seed={anime.id} />;
  }

  return (
    <>
      {status === "loading" && (
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-muted via-muted/60 to-muted"
        />
      )}
      <picture>
        {/* Two variants, picked by the browser before anything is fetched.
            The large one is what a 2:3 poster needs on a desktop grid; the
            small one is half the bytes and is all a phone can use. */}
        <source media="(max-width: 639px)" srcSet={imageSrc(anime.imageUrl)} />
        <img
          src={imageSrc(small ? anime.imageUrl : (anime.imageLargeUrl ?? anime.imageUrl))}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setStatus("ok")}
          onError={() => setStatus("failed")}
          className={cn(
            "size-full object-cover transition-[transform,opacity] duration-500 motion-reduce:transition-none",
            status === "ok" ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      </picture>
    </>
  );
}
