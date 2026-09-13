import type { AdminCommentQuery, AdminCommentSummary } from "@animeshadow/shared";
import {
  ArrowUpDownIcon,
  FilterIcon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
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
import { useAdminComments, useAdminDeleteComment } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  AnimeThumb,
  errorMessage,
  FilterSelect,
  RowActions,
  SearchInput,
  TablePager,
  TableShell,
  TableSkeleton,
  timeAgo,
  UserAvatar,
} from "./admin-ui";

export function AdminComments() {
  const t = useT();
  const { locale } = useLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminCommentQuery["status"]>("all");
  const [sort, setSort] = useState<AdminCommentQuery["sort"]>("newest");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminCommentSummary | null>(null);
  const query = useDebouncedValue(search.trim());

  const { data, isPending, isError, isFetching, refetch } = useAdminComments({
    ...(query ? { query } : {}),
    status,
    sort,
    page,
  });
  const remove = useAdminDeleteComment();
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
              placeholder={t("admin.comments.searchPlaceholder")}
            />
            <FilterSelect
              value={status}
              onChange={resettingPage(setStatus)}
              icon={<FilterIcon />}
              options={[
                { value: "all", label: t("admin.comments.statusAll") },
                { value: "active", label: t("admin.comments.statusActive") },
                { value: "deleted", label: t("admin.comments.statusDeleted") },
              ]}
            />
            <FilterSelect
              value={sort}
              onChange={resettingPage(setSort)}
              icon={<ArrowUpDownIcon />}
              options={[
                { value: "newest", label: t("admin.comments.sortNewest") },
                { value: "oldest", label: t("admin.comments.sortOldest") },
                { value: "top", label: t("admin.comments.sortTop") },
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
            <EmptyState
              title={t("admin.comments.emptyTitle")}
              description={t("admin.comments.emptyBody")}
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t("admin.comments.columns.author")}</TableHead>
                  <TableHead>{t("admin.comments.columns.anime")}</TableHead>
                  <TableHead>{t("admin.comments.columns.comment")}</TableHead>
                  <TableHead>{t("admin.comments.columns.reactions")}</TableHead>
                  <TableHead>{t("admin.comments.columns.date")}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id} className={cn(row.deleted && "opacity-60")}>
                    <TableCell className="py-3 pl-4">
                      <div className="flex min-w-[10rem] items-center gap-2.5">
                        <UserAvatar name={row.authorName} url={row.authorAvatarUrl} className="size-8" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{row.authorName}</div>
                          {row.mode !== "PUBLIC" && (
                            <Badge variant="outline" className="mt-0.5 h-4 px-1.5 text-[10px]">
                              {row.mode === "ANON" ? t("admin.comments.anon") : t("admin.comments.supporter")}
                            </Badge>
                          )}
                        </div>
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
                      {row.deleted ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t("admin.comments.deleted")}
                        </Badge>
                      ) : (
                        <p className="line-clamp-2 min-w-[14rem] max-w-md text-sm leading-relaxed" title={row.body}>
                          {row.body}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5 text-xs tabular-nums">
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <ThumbsUpIcon className="size-3.5" />
                          {row.likeCount}
                        </span>
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <ThumbsDownIcon className="size-3.5" />
                          {row.dislikeCount}
                        </span>
                      </div>
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
                        {...(row.deleted ? {} : { onDelete: () => setPendingDelete(row) })}
                        labels={{
                          actions: t("admin.comments.actions"),
                          open: t("admin.comments.openAnime"),
                          delete: t("admin.comments.delete"),
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
        title={t("admin.comments.confirmDeleteTitle")}
        description={t("admin.comments.confirmDeleteBody")}
        pending={remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, {
            onSuccess: () => toast.success(t("admin.comments.deletedToast")),
            onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
          });
        }}
      />
    </>
  );
}
