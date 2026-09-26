import { ChevronDownIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The pieces of a page's side panel — "Мой список" and the catalogue share
 * them: a quiet card, list items with a coloured marker (colour means
 * something only there), switches, labelled selects and small stats.
 */

/** Sticky, as tall as the screen under the header; scrolls inside only if it must. */
export const SIDE_ASIDE =
  "flex min-w-0 flex-col gap-3 [@media(max-height:820px)]:gap-2 lg:sticky lg:top-[4.5rem] lg:h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:[scrollbar-width:none]";

export const SIDE_CARD =
  "flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-3.5 [@media(max-height:820px)]:gap-2 [@media(max-height:820px)]:p-3";

export function SideStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <dd className="font-display text-base tabular-nums leading-none">{value}</dd>
      <dt className="mt-1 truncate text-[10px] leading-none text-muted-foreground">{label}</dt>
    </div>
  );
}

export function SideItem({
  label,
  count,
  active,
  dot,
  icon: Icon,
  onClick,
}: {
  label: string;
  count?: number | string;
  active: boolean;
  /** A colour class for the marker dot. */
  dot?: string;
  /** Or an icon instead of a dot. */
  icon?: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex h-8 shrink-0 items-center gap-2.5 lg:h-7 [@media(max-height:820px)]:lg:h-6 rounded-lg px-2.5 text-sm transition-colors lg:w-full",
        active ? "bg-foreground/[0.08] font-medium text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 hidden w-[3px] rounded-full bg-primary lg:block" />}
      {Icon ? (
        <Icon className={cn("size-3.5 shrink-0", active && "text-primary")} />
      ) : (
        <span className={cn("size-2 shrink-0 rounded-full", dot ?? "border border-muted-foreground/60")} />
      )}
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">{count}</span>}
    </button>
  );
}

export function SideToggle({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-foreground/15")}>
        <span className={cn("absolute top-0.5 size-3 rounded-full bg-white shadow transition-transform", on ? "translate-x-3.5" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

export function SideLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-4 items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-muted-foreground">{children}</span>
      {aside}
    </div>
  );
}

const ANY = "__any";

/** One choice or none, as a compact select with its label above. */
export function SideSelect({
  label,
  value,
  anyLabel,
  options,
  onPick,
}: {
  label: string;
  value: string | null;
  anyLabel: string;
  options: Array<{ value: string; label: string; count?: number }>;
  onPick: (value: string | null) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SideLabel>{label}</SideLabel>
      <Select value={value ?? ANY} onValueChange={(v) => onPick(v === ANY ? null : v)}>
        <SelectTrigger
          size="sm"
          className={cn("w-full min-w-0 bg-background/50 text-xs", value && "border-foreground/35 text-foreground")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {o.count != null && <span className="ml-1 text-muted-foreground">{o.count}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A section of the side panel that folds away: the header says what is
 * chosen inside (and how many filters are on), a click opens it with a
 * short slide. Keeps the panel within the screen.
 */
export function SideCollapse({
  label,
  summary,
  badge,
  defaultOpen = false,
  icon: Icon,
  children,
}: {
  label: string;
  summary?: React.ReactNode;
  badge?: number;
  defaultOpen?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Clipped only while it slides: once open, dropdowns inside (a studio
  // list, say) may hang out of it.
  const [settled, setSettled] = useState(defaultOpen);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setSettled(false);
          setOpen((v) => !v);
        }}
        className={cn(
          "group flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left text-sm transition-colors",
          open ? "border-foreground/20 bg-foreground/[0.05]" : "border-border/60 bg-background/40 hover:border-foreground/25",
        )}
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="shrink-0 text-muted-foreground">{label}</span>
        {summary != null && <span className="min-w-0 flex-1 truncate font-medium text-foreground">{summary}</span>}
        {summary == null && <span className="flex-1" />}
        {badge != null && badge > 0 && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
            {badge}
          </span>
        )}
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <div
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "grid-template-rows") setSettled(open);
        }}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={cn("min-h-0", !(open && settled) && "overflow-hidden")} inert={!open}>
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
