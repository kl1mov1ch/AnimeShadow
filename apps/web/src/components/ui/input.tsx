import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Matches the Textarea beside it and the hand-built search fields:
        // the site's radius, and a focus state that blooms in the primary
        // colour rather than the stock grey ring.
        "h-9 w-full min-w-0 rounded-xl border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-all duration-200 outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/15",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
