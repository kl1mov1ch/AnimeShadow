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
        // looking identically neutral.
        classNames: {
          success: "!border-emerald-500/50 !bg-emerald-500/10 [&_svg]:!text-emerald-500",
          error: "!border-destructive/50 !bg-destructive/10 [&_svg]:!text-destructive",
          warning: "!border-amber-500/50 !bg-amber-500/10 [&_svg]:!text-amber-500",
          info: "!border-sky-500/50 !bg-sky-500/10 [&_svg]:!text-sky-500",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
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
