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
        // A solid card a shade lighter than the page, with a thin ring in the
        // message's colour and the icon in a soft badge — sonner's own layout
        // left alone, so nothing shifts.
        classNames: {
          toast:
            "!bg-[color-mix(in_srgb,var(--card)_93%,white_7%)] !text-foreground !border !border-[color-mix(in_srgb,var(--primary)_30%,transparent)] !rounded-2xl !shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)] !items-center",
          title: "!text-[13.5px] !font-semibold",
          description: "!text-xs !text-muted-foreground",
          icon: "grid !size-7 shrink-0 place-items-center rounded-full bg-primary/15 [&_svg]:!size-4",
          success: "[&_[data-icon]]:!text-primary",
          error: "!border-destructive/40 [&_[data-icon]]:!bg-destructive/15 [&_[data-icon]]:!text-destructive",
          warning: "!border-amber-400/40 [&_[data-icon]]:!bg-amber-400/15 [&_[data-icon]]:!text-amber-400",
          info: "!border-border [&_[data-icon]]:!bg-foreground/10 [&_[data-icon]]:!text-foreground/80",
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
