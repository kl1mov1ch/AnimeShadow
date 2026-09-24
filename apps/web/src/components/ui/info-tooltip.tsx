import { InfoIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * An (i) hint that works the same on mouse and touch. Radix's `Tooltip` is
 * hover/focus-driven and doesn't reliably open on a tap — a touch has no
 * "hover" state, so on a phone the content either never opens or opens and
 * immediately closes. `Popover` is click-driven either way (a tap is a
 * click) and already dismisses on outside-tap/Escape, so it's the right
 * primitive for a hint the user actively opens, not a passive hover-preview.
 */
export function InfoTooltip({
  children,
  className,
  align = "start",
  side = "top",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const t = useT();
  // Tracked here rather than left to Radix so the trigger can answer the
  // open state: the (i) turns into the cross that closes it, which is the
  // whole affordance — one button, two meanings, and you can see it change.
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("common.moreInfo")}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
            open
              ? "text-primary"
              : "text-muted-foreground/60 hover:text-foreground",
            className,
          )}
        >
          <MorphIcon on={open} off={InfoIcon} onIcon={XIcon} className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-64 max-w-[80vw] border-[var(--accent-line-soft)] text-xs leading-relaxed shadow-lg shadow-black/10 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
