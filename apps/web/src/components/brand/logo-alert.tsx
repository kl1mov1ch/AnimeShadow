import { cn } from "@/lib/utils";
import { SlicedGlyph } from "./sliced-glyph";

/**
 * The site's mark with an exclamation badge — the warning sign for
 * confirmations and failures, in the site's own face rather than a stock
 * triangle. `tone` picks the colour: destructive for "are you sure", the
 * site colour for "something went wrong".
 */
export function LogoAlert({
  tone = "primary",
  className,
}: {
  tone?: "primary" | "destructive";
  className?: string;
}) {
  const destructive = tone === "destructive";
  return (
    <span
      aria-hidden
      className={cn(
        "sliced-glyph-host relative grid size-14 place-items-center rounded-2xl",
        destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
        className,
      )}
    >
      <SlicedGlyph className="text-[1.75rem]" />
      <span
        className={cn(
          "absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-[11px] font-black leading-none ring-2 ring-background",
          destructive ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
        )}
      >
        !
      </span>
    </span>
  );
}
