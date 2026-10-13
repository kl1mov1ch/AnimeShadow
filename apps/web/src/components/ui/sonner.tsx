"use client"

import { Loader2Icon } from "lucide-react"
import { ErrorMark, InfoMark, SuccessMark } from "./toast-icons"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <SuccessMark />,
        info: <InfoMark />,
        warning: <InfoMark tone="warning" />,
        error: <ErrorMark />,
        loading: <Loader2Icon className="size-5 animate-spin text-primary" />,
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
            "!bg-[color-mix(in_srgb,var(--card)_93%,white_7%)] !text-foreground !border !border-[color-mix(in_srgb,var(--primary)_30%,transparent)] !rounded-2xl !shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)] !items-center !gap-3 !py-3.5 !pl-3.5",
          title: "!text-[13.5px] !font-semibold !leading-snug",
          description: "!text-xs !text-muted-foreground",
          // The mark sizes itself; the slot only centres it.
          icon: "!m-0 !size-9 !shrink-0 !flex !items-center !justify-center",
          error: "!border-destructive/40",
          warning: "!border-amber-400/40",
          info: "!border-border",
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
