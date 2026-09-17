import { ChevronsLeftIcon, ChevronsRightIcon } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface PaginationBarProps {
  page: number;
  hasNextPage: boolean;
  totalPages: number;
  buildHref: (page: number) => string;
}

/** How many numbered pages to show at once. */
const WINDOW = 6;

/**
 * A sliding window of `WINDOW` consecutive pages around the current one,
 * clamped to the ends, with first/last pinned and gaps marked by an ellipsis.
 */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= WINDOW + 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  // Centre the window on the current page, then push it back inside bounds so
  // the first and last pages still show a full run of numbers.
  let start = Math.max(1, page - Math.floor((WINDOW - 1) / 2));
  let end = start + WINDOW - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - WINDOW + 1;
  }

  const pages = new Set<number>([1, totalPages]);
  for (let p = start; p <= end; p += 1) pages.add(p);

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  let previous = 0;
  for (const current of sorted) {
    if (current - previous > 1) result.push("…");
    result.push(current);
    previous = current;
  }
  return result;
}

export function PaginationBar({
  page,
  hasNextPage,
  totalPages,
  buildHref,
}: PaginationBarProps) {
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <Pagination>
      <PaginationContent>
        {/* Jump to the first page — kept on every breakpoint, so phones get it too. */}
        <PaginationItem>
          <PaginationLink
            to={buildHref(1)}
            aria-label="1"
            aria-disabled={atStart}
            className={atStart ? "pointer-events-none opacity-50" : undefined}
          >
            <ChevronsLeftIcon className="size-4" />
          </PaginationLink>
        </PaginationItem>

        <PaginationItem>
          <PaginationPrevious
            to={buildHref(Math.max(1, page - 1))}
            aria-disabled={atStart}
            className={atStart ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {/* The numbers cascade in as the window slides, so paging forward
            reads as movement rather than a silent swap. Entry only — no
            looping animation to keep running afterwards. */}
        {items.map((item, index) =>
          item === "…" ? (
            <PaginationItem key={`gap-${index}`} className="hidden sm:list-item">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem
              key={item}
              className="animate-in fade-in zoom-in-95 hidden duration-300 sm:list-item"
              style={{
                animationDelay: `${index * 30}ms`,
                animationFillMode: "backwards",
              }}
            >
              <PaginationLink to={buildHref(item)} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        {/* A phone has no room for the number row, so it gets the same
            information as a compact readout — the current page carried in
            the site colour rather than a flat grey fraction. */}
        <PaginationItem className="sm:hidden">
          <span className="flex items-baseline gap-1 px-3 text-sm tabular-nums">
            <span className="font-semibold text-primary">{page}</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="text-muted-foreground">{totalPages}</span>
          </span>
        </PaginationItem>

        <PaginationItem>
          <PaginationNext
            to={buildHref(page + 1)}
            aria-disabled={!hasNextPage}
            className={!hasNextPage ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {/* Straight to the last page. */}
        <PaginationItem>
          <PaginationLink
            to={buildHref(totalPages)}
            aria-label={String(totalPages)}
            aria-disabled={atEnd}
            className={atEnd ? "pointer-events-none opacity-50" : undefined}
          >
            <ChevronsRightIcon className="size-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
