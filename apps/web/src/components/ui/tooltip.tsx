"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // A card, not an inverted chip: the rest of the site is built out
          // of accent-edged surfaces, and a tooltip used to be the one
          // element that looked borrowed from somewhere else.
          //
          // Opaque, deliberately. A tooltip almost always opens over busy
          // artwork — a poster, a frame, a banner — and a translucent panel
          // there means reading text through a picture. Everything else
          // about it is sized for being read at a glance rather than for
          // being small: 12px at medium weight, a full-strength border, and
          // a shadow heavy enough to lift it clear of whatever is behind.
          "z-50 w-fit max-w-[min(20rem,80vw)] origin-(--radix-tooltip-content-transform-origin) rounded-lg border border-border bg-popover px-3 py-2 text-[12px] leading-snug font-medium text-balance text-popover-foreground shadow-xl shadow-black/25 ring-1 ring-[var(--accent-line-soft)]",
          // It arrives from the side it points at, overshooting slightly,
          // and leaves faster than it came — the asymmetry is what makes an
          // appearance feel deliberate and a dismissal feel instant.
          "animate-in duration-200 ease-out fade-in-0 zoom-in-90 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=closed]:duration-120 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_3px)] rotate-45 rounded-[2px] border-b border-r border-border bg-popover fill-popover" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
