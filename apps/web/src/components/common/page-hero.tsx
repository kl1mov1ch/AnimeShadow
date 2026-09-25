import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a standalone page, drawn the way the catalogue's is: the
 * site's accent surface, a glow from the upper right, 影 as a watermark,
 * a small eyebrow over a display-face title. About, support and frame
 * search each had their own grey card with a hairline on top; now they
 * open like the rest of the site.
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
  /** A small chip after the eyebrow ("beta"). */
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
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] px-5 py-7 sm:px-8 sm:py-10",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 120% at 100% 0%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 70%), radial-gradient(40% 80% at 0% 100%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[9rem] leading-none text-primary/[0.07] sm:text-[12rem]"
      >
        影
      </span>

      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Icon className="size-3.5" />
              {eyebrow}
            </span>
            {badge && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-md shadow-primary/30">
                {badge}
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
          {lead && <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">{lead}</p>}
          {children}
        </div>
        {aside && <div className="relative shrink-0">{aside}</div>}
      </div>
    </header>
  );
}

/** A section heading in the same voice: an icon tile, a title, an optional note. */
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
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg leading-tight tracking-tight sm:text-xl">{title}</h2>
        {note && <p className="text-xs text-muted-foreground sm:text-sm">{note}</p>}
      </div>
    </div>
  );
}
