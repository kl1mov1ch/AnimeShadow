import { useState } from "react";
import { imageSrc } from "@/lib/format";
import { useReactionGif } from "@/lib/query";
import { cn } from "@/lib/utils";

/**
 * A reaction gif from nekos.best (through our own image proxy) — for a
 * page that wants a face on it. While it loads, or if it can't, a soft
 * square with the site's mark stands in; never a broken picture.
 */
export function ReactionGif({ category, className }: { category: string; className?: string }) {
  const { data } = useReactionGif(category);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = data?.url && data.url !== brokenUrl ? imageSrc(data.url) : null;
  return (
    <span className={cn("relative block overflow-hidden rounded-2xl bg-foreground/[0.06]", className)}>
      {url ? (
        <img key={url} src={url} alt="" decoding="async" loading="lazy" onError={() => setBrokenUrl(data?.url ?? null)} className="size-full object-cover" />
      ) : (
        <span aria-hidden className="grid size-full place-items-center font-display text-4xl text-primary/30">
          影
        </span>
      )}
    </span>
  );
}
