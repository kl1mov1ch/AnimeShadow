import { ChevronsLeftIcon, ChevronsRightIcon, CornerDownLeftIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [jump, setJump] = useState("");
  if (totalPages <= 1) return null;
  const items = pageWindow(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const go = () => {
    const n = Number.parseInt(jump, 10);
    if (Number.isFinite(n)) navigate(buildHref(Math.min(totalPages, Math.max(1, n))));
    setJump("");
  };

  return (
    <Pagination className="flex-wrap items-center gap-2">
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

      {/* Straight to any page: type it, Enter. Only worth it on long lists. */}
      {totalPages > 8 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
          className="hidden h-11 items-center gap-1.5 rounded-xl border border-border/60 bg-card/50 pl-3 pr-1 text-xs text-muted-foreground sm:flex"
        >
          <span>Стр.</span>
          <input
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
            inputMode="numeric"
            placeholder={String(page)}
            aria-label="Перейти на страницу"
            className="h-8 w-12 rounded-md border border-border/60 bg-background/60 text-center text-sm tabular-nums text-foreground outline-none focus:border-foreground/40"
          />
          <span className="tabular-nums">из {totalPages}</span>
          <button
            type="submit"
            aria-label="Перейти"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
          >
            <CornerDownLeftIcon className="size-3.5" />
          </button>
        </form>
      )}
    </Pagination>
  );
}
