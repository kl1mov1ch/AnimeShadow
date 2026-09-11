import { StarIcon } from "lucide-react";
import { scoreLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Community score — the familiar dark pill with a yellow star, the same shape
 * every catalogue site uses. One consistent look at any score; the number does
 * the talking.
 */
export function ScoreBadge({ score, className, size = "sm" }: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-black/70 font-semibold text-white tabular-nums backdrop-blur",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        className,
      )}
    >
      <StarIcon
        className={cn(
          "fill-amber-400 text-amber-400",
          size === "sm" ? "size-3" : "size-3.5",
        )}
      />
      {scoreLabel(score)}
    </span>
  );
}
