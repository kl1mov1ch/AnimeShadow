import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a standalone page, the way the catalogue's reads: a small
 * label, the page's name in the display face, a line of explanation, and
 * whatever the page wants to offer right there. No card, no glow, no
 * watermark — every page opens the same quiet way, and the content below
 * is what carries the colour.
 */
export function PageHero({
  icon: Icon,
  eyebrow,
  badge,
  title,
  lead,
  children,
  aside,
  className,
}: {
  icon: LucideIcon;
  eyebrow: string;
  /** A small tag after the label ("beta"). */
  badge?: string;
  title: string;
  lead?: ReactNode;
  /** Actions and notes under the lead. */
  children?: ReactNode;
  /** Something to the right on wide screens. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex max-w-2xl flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          {eyebrow}
          {badge && (
            <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
              {badge}
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
        {lead && <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{lead}</p>}
        {children}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/** A section heading in the same voice: an icon, a title, an optional note. */
export function SectionTitle({
  icon: Icon,
  title,
  note,
  className,
}: {
  icon: LucideIcon;
  title: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/80">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg leading-tight tracking-tight sm:text-xl">{title}</h2>
        {note && <p className="text-xs text-muted-foreground sm:text-sm">{note}</p>}
      </div>
    </div>
  );
}
