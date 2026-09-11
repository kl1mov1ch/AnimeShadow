import { StarIcon } from "lucide-react";
import { scoreLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Community score. Neutral surface, one star mark — the number does the talking,
 * so it reads the same whether the score is 9.2 or 6.1.
 */
export function ScoreBadge({ score, className, size = "sm" }: ScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-secondary/80 font-medium text-secondary-foreground tabular-nums backdrop-blur",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        className,
      )}
    >
      <StarIcon
        className={cn(
          "fill-primary text-primary",
          size === "sm" ? "size-3" : "size-3.5",
        )}
      />
      {scoreLabel(score)}
    </span>
  );
}
