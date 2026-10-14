import type { LucideIcon } from "lucide-react";
import { LockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The profile's surfaces. One panel shape everywhere — a soft tinted card in
 * the profile's own accent — with a header that names the part, an icon in
 * the accent, and room on the right for its one action.
 */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate flex flex-col overflow-hidden rounded-3xl border border-[var(--accent-line-soft)] bg-[linear-gradient(180deg,var(--accent-surface),transparent_140%)] p-4 sm:p-5",
        className,
      )}
    >
      {title && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 font-display text-base tracking-tight sm:text-lg">
            {Icon && (
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent-surface-strong)] text-[var(--accent-ink)] ring-1 ring-[var(--accent-line-soft)]">
                <Icon className="size-4" />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h2>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A small pill button for a panel's header. */
export function PanelAction({
  children,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--accent-line-soft)] px-3 text-xs font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </button>
  );
}

/** What a part says when there is nothing in it yet — with what to do about it. */
export function EmptyNote({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--accent-line-soft)] px-4 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

/** A part the owner keeps private. */
export function LockedNote({ what }: { what: string }) {
  return <EmptyNote icon={LockIcon} title={`${what} скрыт настройками приватности`} hint="Владелец профиля решил не показывать это другим." />;
}

/** A row of choices as pills, one lit. */
export function Pills<T extends string>({
  value,
  options,
  onPick,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onPick: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-200",
              on
                ? "border-primary/50 bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                : "border-[var(--accent-line-soft)] text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn("tabular-nums", on ? "text-primary-foreground/80" : "text-muted-foreground/60")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
