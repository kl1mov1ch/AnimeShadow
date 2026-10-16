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
        loading: (
          <span className="ti ti-loading">
            <Loader2Icon className="size-5 animate-spin" />
          </span>
        ),
      }}
      toastOptions={{
        // Sonner's own slide/fade-in is already smooth; this just makes each
        // kind of message readable at a glance instead of every toast
        // looking identically neutral. Every toast also carries a faint
        // "影" watermark (the site's own mark, same glyph as the header
        // logo and the error pages) — `text-foreground` tracks light/dark
        // automatically, so it's the same subtle presence in either theme,
        // never competing with the actual message on top of it.
        // Each kind has its own colour from the site's palette (see .toast-*
        // in index.css: green for done, red for errors, amber for warnings,
        // blue for news, the brand colour while loading) — a stripe on the
        // left, a soft wash, the mark, a timer line along the bottom and the
        // action button all wear it, so the eye lands on what happened and
        // what to do. Sonner's own layout is left alone, so nothing shifts.
        classNames: {
          toast: "toast-card !max-w-[calc(100vw-1.5rem)] !flex-wrap !rounded-2xl !items-center !gap-3 !py-3.5 !pl-4 !pr-3.5 [&>[data-content]]:min-w-0 [&>[data-content]]:flex-1",
          title: "!break-words !text-[13.5px] !font-semibold !leading-snug",
          description: "!break-words !text-xs !text-muted-foreground",
          // The mark sizes itself; the slot only centres it.
          icon: "!m-0 !size-9 !shrink-0 !flex !items-center !justify-center",
          actionButton: "toast-action !h-8 !rounded-lg !px-3 !text-xs !font-bold",
          cancelButton: "!h-8 !rounded-lg !px-3 !text-xs",
        },
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(356px, calc(100vw - 24px))",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
