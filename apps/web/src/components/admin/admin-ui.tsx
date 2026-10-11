import type { PaginationMeta } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Shared entrance animation — pair with an inline `animationDelay` to stagger. */
export const ENTER =
  "animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:both]";

/** `useId()` output is not a valid SVG `url(#…)` reference in React 19. */
export function useSafeId(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** 0 on the first paint, `target` on the next — lets a CSS transition run on mount. */
export function useEnterValue(target: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setValue(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

export function timeAgo(iso: string, locale: string): string {
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(seconds / (86_400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86_400 * 365)), "year");
}

/** Seen within this long counts as online right now. */
const ONLINE_WINDOW_MS = 5 * 60_000;

export function isOnline(lastSeenAt: string | null): boolean {
  return lastSeenAt != null && Date.now() - Date.parse(lastSeenAt) < ONLINE_WINDOW_MS;
}

export function useFormatDuration(): (seconds: number) => string {
  const t = useT();
  return (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0
      ? `${hours.toLocaleString()} ${t("admin.units.h")} ${minutes} ${t("admin.units.m")}`
      : `${minutes} ${t("admin.units.m")}`;
  };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Panel({
  title,
  description,
  icon,
  action,
  className,
  children,
  delay = 0,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        ENTER,
        "flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4.5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-base leading-tight">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-32 flex-1 place-items-center rounded-xl border border-dashed border-border/60 px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

export function BarRow({
  label,
  value,
  max,
  color,
  suffix,
}: {
  label: ReactNode;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  const width = useEnterValue(max > 0 ? Math.max(3, (value / max) * 100) : 0);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">
          {value.toLocaleString()}
          {suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function UserAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 ring-1 ring-border/60", className)}>
      {url && <AvatarImage src={imageSrc(url)} alt="" />}
      <AvatarFallback className="text-xs font-semibold">
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

export function AnimeThumb({
  id,
  slug,
  title,
  imageUrl,
}: {
  id: number;
  slug: string;
  title: string;
  imageUrl: string | null;
}) {
  return (
    <Link to={animeHref({ id, slug })} className="group flex min-w-0 items-center gap-2.5">
      <span className="h-12 w-8 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
        {imageUrl && (
          <img
            src={imageSrc(imageUrl)}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </span>
      <span className="line-clamp-2 max-w-[12rem] text-sm font-medium leading-snug transition-colors group-hover:text-primary">
        {title}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function TableShell({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(ENTER, "overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)]")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 p-3 sm:p-4">
        {toolbar}
      </div>
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full min-w-[12rem] sm:w-auto sm:flex-1 sm:max-w-sm">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 bg-background/60 pl-9"
      />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  icon,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  icon?: ReactNode;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className="h-9 min-w-[10.5rem] gap-2 bg-background/60">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TablePager({
  meta,
  count,
  onPage,
}: {
  meta: PaginationMeta;
  count: number;
  onPage: (page: number) => void;
}) {
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.perPage));
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.perPage + 1;
  const to = (meta.page - 1) * meta.perPage + count;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
      <span>
        {t("admin.pager.shown")}{" "}
        <b className="font-semibold tabular-nums text-foreground">
          {from}–{to}
        </b>{" "}
        {t("admin.pager.of")} <b className="font-semibold tabular-nums text-foreground">{meta.total}</b>
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label={t("admin.pager.prev")}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-[4.5rem] text-center tabular-nums">
          {meta.page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!meta.hasNextPage}
          onClick={() => onPage(meta.page + 1)}
          aria-label={t("admin.pager.next")}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-border/50">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          {/* Stands in for a button, and buttons are pills now — a
              rounded-lg placeholder changed shape on load. */}
          <Skeleton className="hidden h-8 w-28 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Row menu: open the related anime, and (optionally) delete. The menu is
 * non-modal so the confirm dialog it opens doesn't inherit a stuck
 * `pointer-events: none` on the body from the closing menu. */
export function RowActions({
  href,
  onDelete,
  labels,
}: {
  href: string;
  onDelete?: () => void;
  labels: { actions: string; open: string; delete: string };
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={labels.actions}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link to={href}>
            <ExternalLinkIcon />
            {labels.open}
          </Link>
        </DropdownMenuItem>
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive [&_svg]:text-destructive"
              onSelect={onDelete}
            >
              <Trash2Icon />
              {labels.delete}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
