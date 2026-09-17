"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Slider as SliderPrimitive } from "radix-ui"

/**
 * The stock shadcn slider was the last flat grey control left: a hairline
 * track, a solid fill and a white dot. This one is built on the same
 * language as the rest of the site — a gradient fill that glows, a thumb
 * that grows under the cursor and blooms a ring on focus.
 *
 * Every `data-slot` is load-bearing: the watch player restyles this exact
 * component through `[&_[data-slot=slider-track]]` selectors for its seek
 * and volume bars, so the hooks have to stay put even when the look
 * changes. Nothing here sets a border or a fixed background on the track
 * for the same reason — those would survive the player's overrides and
 * show up as a stray outline across the video controls.
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "group relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative grow overflow-hidden rounded-full bg-secondary/70 transition-all duration-200 group-hover:bg-secondary",
          "data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute rounded-full bg-gradient-to-r from-primary/70 via-primary to-primary transition-[filter] duration-200",
            "shadow-[0_0_12px_-2px_var(--primary)] group-hover:brightness-110",
            "data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full data-[orientation=vertical]:bg-gradient-to-t"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className={cn(
            "block size-4 shrink-0 cursor-grab rounded-full border-2 border-primary bg-background shadow-md shadow-primary/30",
            "transition-[transform,box-shadow,border-color] duration-150 hover:scale-125 hover:shadow-lg hover:shadow-primary/40",
            "focus-visible:scale-125 focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-hidden",
            "active:scale-110 active:cursor-grabbing",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
