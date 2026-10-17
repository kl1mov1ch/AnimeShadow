"use client"

import { CheckIcon, CircleAlertIcon, InfoIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      visibleToasts={3}
      duration={4500}
      offset={16}
      mobileOffset={{ bottom: "calc(var(--mobile-nav-space, 0px) + 12px)", left: 12, right: 12 }}
      icons={{
        success: <CheckIcon className="size-5 text-emerald-400" />,
        info: <InfoIcon className="size-5 text-sky-400" />,
        warning: <TriangleAlertIcon className="size-5 text-amber-400" />,
        error: <CircleAlertIcon className="size-5 text-rose-400" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      toastOptions={{
        // Compact cards keep the event, explanation and action easy to scan.
        classNames: {
          toast: "toast-card !max-w-[calc(100vw-1.5rem)] !flex-wrap !rounded-xl !items-center !gap-2.5 !p-3 [&>[data-content]]:min-w-0 [&>[data-content]]:flex-1",
          title: "!break-words !text-[13.5px] !font-semibold !leading-snug",
          description: "!break-words !text-xs !text-muted-foreground",
          // The mark sizes itself; the slot only centres it.
          icon: "!m-0 !size-6 !shrink-0 !flex !items-center !justify-center",
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
