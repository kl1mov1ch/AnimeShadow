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

/** Windowed page numbers around the current page, plus first/last. */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

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

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            to={buildHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>

        {items.map((item, index) =>
          item === "…" ? (
            <PaginationItem key={`gap-${index}`} className="hidden sm:list-item">
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item} className="hidden sm:list-item">
              <PaginationLink to={buildHref(item)} isActive={item === page}>
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem className="sm:hidden">
          <span className="px-3 text-sm text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
        </PaginationItem>

        <PaginationItem>
          <PaginationNext
            to={buildHref(page + 1)}
            aria-disabled={!hasNextPage}
            className={!hasNextPage ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
