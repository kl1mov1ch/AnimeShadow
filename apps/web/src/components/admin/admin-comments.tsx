import type { AdminCommentQuery, AdminCommentSummary } from "@animeshadow/shared";
import {
  ArrowUpDownIcon,
  CheckIcon,
  FilterIcon,
  FlagIcon,
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
import { useAdminComments, useAdminDeleteComment, useAdminDismissCommentReports } from "@/lib/query";
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
  const dismiss = useAdminDismissCommentReports();
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
                { value: "reported", label: t("admin.comments.statusReported") },
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
                  <TableHead className="hidden md:table-cell">{t("admin.comments.columns.anime")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("admin.comments.columns.comment")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("admin.comments.columns.reactions")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("admin.comments.columns.date")}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id} className={cn(row.deleted && "opacity-60")}>
                    <TableCell className="py-3 pl-4 align-top md:align-middle">
                      <div className="flex min-w-0 items-center gap-2.5 md:min-w-[10rem]">
                        <UserAvatar name={row.authorName} url={row.authorAvatarUrl} className="size-8" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{row.authorName}</div>
                          {row.mode !== "PUBLIC" && (
                            <Badge variant="outline" className="mt-0.5 h-4 px-1.5 text-[10px]">
                              {row.mode === "ANON" ? t("admin.comments.anon") : t("admin.comments.supporter")}
                            </Badge>
                          )}
                          <div className="truncate text-[11px] text-muted-foreground md:hidden">
                            {row.animeTitle} · {timeAgo(row.createdAt, locale)}
                          </div>
                        </div>
                      </div>
                      {/* The text itself, full width under its author on a phone. */}
                      <div className="mt-2 md:hidden">
                        {row.deleted ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("admin.comments.deleted")}
                          </Badge>
                        ) : (
                          <p className="line-clamp-4 whitespace-normal text-sm leading-relaxed">{row.body}</p>
                        )}
                        <ReportsLine row={row} pending={dismiss.isPending} onDismiss={() => dismiss.mutate(row.id, { onSuccess: () => toast.success("Жалобы отклонены") })} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <AnimeThumb
                        id={row.animeId}
                        slug={row.animeSlug}
                        title={row.animeTitle}
                        imageUrl={row.animeImageUrl}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.deleted ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t("admin.comments.deleted")}
                        </Badge>
                      ) : (
                        <p className="line-clamp-2 min-w-[14rem] max-w-md text-sm leading-relaxed" title={row.body}>
                          {row.body}
                        </p>
                      )}
                      <ReportsLine row={row} pending={dismiss.isPending} onDismiss={() => dismiss.mutate(row.id, { onSuccess: () => toast.success("Жалобы отклонены") })} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
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
                    <TableCell className="hidden md:table-cell">
                      <Tooltip>
                        <TooltipTrigger className="whitespace-nowrap text-sm text-muted-foreground">
                          {timeAgo(row.createdAt, locale)}
                        </TooltipTrigger>
                        <TooltipContent>{fullDate.format(new Date(row.createdAt))}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="pr-4 text-right align-top md:align-middle">
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

const REPORT_REASON: Record<string, string> = {
  spam: "спам",
  abuse: "оскорбления",
  spoiler: "спойлер",
  offtopic: "не по теме",
  other: "другое",
};

/** Open complaints about a comment: how many, why, and "nothing wrong" to close them (deleting closes them too). */
function ReportsLine({ row, pending, onDismiss }: { row: AdminCommentSummary; pending: boolean; onDismiss: () => void }) {
  if (row.reports === 0 || row.deleted) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-500 dark:text-rose-300">
        <FlagIcon className="size-3" />
        {row.reports}
      </span>
      <span className="text-muted-foreground">{row.reportReasons.map((r) => REPORT_REASON[r] ?? r).join(", ")}</span>
      <button
        type="button"
        disabled={pending}
        onClick={onDismiss}
        className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground transition-colors hover:border-emerald-500/50 hover:text-emerald-500 disabled:opacity-50"
      >
        <CheckIcon className="size-3" /> Всё в порядке
      </button>
    </div>
  );
}
