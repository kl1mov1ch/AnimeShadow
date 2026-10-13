"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        // Sonner's own slide/fade-in is already smooth; this just makes each
        // kind of message readable at a glance instead of every toast
        // looking identically neutral. Every toast also carries a faint
        // "影" watermark (the site's own mark, same glyph as the header
        // logo and the error pages) — `text-foreground` tracks light/dark
        // automatically, so it's the same subtle presence in either theme,
        // never competing with the actual message on top of it.
        // Solid, never see-through: the card colour of the site, a stripe and
        // an icon in the message's colour, the 影 faint in the corner.
        classNames: {
          toast:
            "!rounded-2xl !border !border-[var(--accent-line-soft)] !bg-card !text-foreground !shadow-2xl !shadow-black/50 !py-3.5 !pl-4 !pr-5 !gap-3 relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary after:pointer-events-none after:absolute after:-right-2 after:-bottom-5 after:select-none after:font-display after:text-7xl after:leading-none after:text-foreground/[0.05] after:content-['影']",
          title: "!text-[13.5px] !font-semibold",
          description: "!text-xs !text-muted-foreground",
          icon: "!m-0 grid !size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07]",
          success: "before:!bg-primary [&_[data-icon]]:!bg-primary/15 [&_svg]:!text-primary",
          error: "before:!bg-destructive [&_[data-icon]]:!bg-destructive/15 [&_svg]:!text-destructive",
          warning: "before:!bg-amber-400 [&_[data-icon]]:!bg-amber-400/15 [&_svg]:!text-amber-400",
          info: "before:!bg-foreground/50 [&_svg]:!text-foreground/80",
          actionButton: "!bg-primary !text-primary-foreground !rounded-lg",
          cancelButton: "!rounded-lg",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
