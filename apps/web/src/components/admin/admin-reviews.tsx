import type { AdminReviewQuery, AdminReviewSummary } from "@animeshadow/shared";
import { ArrowUpDownIcon, Loader2Icon, StarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLocale, useT } from "@/i18n";
import { animeHref } from "@/lib/format";
import { useAdminDeleteReview, useAdminReviews } from "@/lib/query";
import {
  AnimeThumb,
  errorMessage,
  FilterSelect,
  RowActions,
  ScoreRing,
  SearchInput,
  TablePager,
  TableShell,
  TableSkeleton,
  timeAgo,
  UserAvatar,
} from "./admin-ui";

export function AdminReviews() {
  const t = useT();
  const { locale } = useLocale();
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState<AdminReviewQuery["rating"]>("all");
  const [sort, setSort] = useState<AdminReviewQuery["sort"]>("newest");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminReviewSummary | null>(null);
  const query = useDebouncedValue(search.trim());

  const { data, isPending, isError, isFetching, refetch } = useAdminReviews({
    ...(query ? { query } : {}),
    rating,
    sort,
    page,
  });
  const remove = useAdminDeleteReview();
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const resettingPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <TableShell
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder={t("admin.reviews.searchPlaceholder")}
            />
            <FilterSelect
              value={rating}
              onChange={resettingPage(setRating)}
              icon={<StarIcon />}
              options={[
                { value: "all", label: t("admin.reviews.ratingAll") },
                { value: "positive", label: t("admin.reviews.ratingPositive") },
                { value: "mixed", label: t("admin.reviews.ratingMixed") },
                { value: "negative", label: t("admin.reviews.ratingNegative") },
              ]}
            />
            <FilterSelect
              value={sort}
              onChange={resettingPage(setSort)}
              icon={<ArrowUpDownIcon />}
              options={[
                { value: "newest", label: t("admin.reviews.sortNewest") },
                { value: "oldest", label: t("admin.reviews.sortOldest") },
                { value: "best", label: t("admin.reviews.sortBest") },
                { value: "worst", label: t("admin.reviews.sortWorst") },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              {isFetching && !isPending && (
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              )}
              {data && (
                <Badge variant="secondary" className="tabular-nums">
                  {data.meta.total.toLocaleString()}
                </Badge>
              )}
            </div>
          </>
        }
      >
        {isPending ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <div className="p-4">
            <ErrorState onRetry={() => void refetch()} />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("admin.reviews.emptyTitle")} description={t("admin.reviews.emptyBody")} />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t("admin.reviews.columns.author")}</TableHead>
                  <TableHead>{t("admin.reviews.columns.anime")}</TableHead>
                  <TableHead>{t("admin.reviews.columns.rating")}</TableHead>
                  <TableHead>{t("admin.reviews.columns.review")}</TableHead>
                  <TableHead>{t("admin.reviews.columns.date")}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="py-3 pl-4">
                      <div className="flex min-w-[10rem] items-center gap-2.5">
                        <UserAvatar name={row.authorName} url={row.authorAvatarUrl} className="size-8" />
                        <span className="truncate text-sm font-medium">{row.authorName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <AnimeThumb
                        id={row.animeId}
                        slug={row.animeSlug}
                        title={row.animeTitle}
                        imageUrl={row.animeImageUrl}
                      />
                    </TableCell>
                    <TableCell>
                      <ScoreRing value={row.rating} />
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-3 min-w-[16rem] max-w-lg text-sm leading-relaxed" title={row.body}>
                        {row.body}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger className="whitespace-nowrap text-sm text-muted-foreground">
                          {timeAgo(row.createdAt, locale)}
                        </TooltipTrigger>
                        <TooltipContent>{fullDate.format(new Date(row.createdAt))}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <RowActions
                        href={animeHref({ id: row.animeId, slug: row.animeSlug })}
                        onDelete={() => setPendingDelete(row)}
                        labels={{
                          actions: t("admin.reviews.actions"),
                          open: t("admin.reviews.openAnime"),
                          delete: t("admin.reviews.delete"),
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePager meta={data.meta} count={data.items.length} onPage={setPage} />
          </>
        )}
      </TableShell>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.reviews.confirmDeleteTitle")}
        description={t("admin.reviews.confirmDeleteBody")}
        pending={remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, {
            onSuccess: () => toast.success(t("admin.reviews.deletedToast")),
            onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
          });
        }}
      />
    </>
  );
}
