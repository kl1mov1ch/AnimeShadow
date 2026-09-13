import type { AdminCommentSummary, AdminReviewSummary, AdminUserSummary } from "@animeshadow/shared";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import {
  useAdminComments,
  useAdminDeleteComment,
  useAdminDeleteReview,
  useAdminOverview,
  useAdminReviews,
  useAdminSetUser,
  useAdminUsers,
} from "@/lib/query";
import { cn } from "@/lib/utils";

export function Component() {
  const { status, user } = useAuth();

  if (status === "loading") return <AdminSkeleton />;
  if (status !== "authenticated" || user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <AdminPanel />;
}

function AdminSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AdminPanel() {
  const t = useT();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <ShieldIcon className="size-6 text-primary" />
        <h1 className="font-display text-2xl">{t("admin.title")}</h1>
      </div>

      <Tabs defaultValue="overview" className="gap-5">
        <TabsList className="h-auto! w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/60 bg-card/40 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="overview" className="h-auto rounded-lg px-3.5 py-2">
            {t("admin.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="users" className="h-auto rounded-lg px-3.5 py-2">
            {t("admin.tabs.users")}
          </TabsTrigger>
          <TabsTrigger value="comments" className="h-auto rounded-lg px-3.5 py-2">
            {t("admin.tabs.comments")}
          </TabsTrigger>
          <TabsTrigger value="reviews" className="h-auto rounded-lg px-3.5 py-2">
            {t("admin.tabs.reviews")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsTab />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- overview ---------------- */

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function fmtSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}ч ${minutes}м`;
}

function OverviewTab() {
  const t = useT();
  const { data, isPending, isError, refetch } = useAdminOverview();

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard title={t("admin.overview.usersCard")}>
        <div className="flex flex-col gap-1.5">
          <Stat label={t("admin.overview.totalUsers")} value={data.users.total} />
          <Stat label={t("admin.overview.admins")} value={data.users.admins} />
          <Stat label={t("admin.overview.newToday")} value={data.users.newToday} />
          <Stat label={t("admin.overview.new7d")} value={data.users.new7d} />
          <Stat label={t("admin.overview.new30d")} value={data.users.new30d} />
        </div>
      </StatCard>

      <StatCard title={t("admin.overview.trafficCard")}>
        <div className="flex flex-col gap-1.5">
          <Stat label={t("admin.overview.pageviewsToday")} value={data.traffic.pageviewsToday} />
          <Stat label={t("admin.overview.pageviews7d")} value={data.traffic.pageviews7d} />
          <Stat label={t("admin.overview.pageviews30d")} value={data.traffic.pageviews30d} />
          <Stat
            label={t("admin.overview.uniqueVisitors")}
            value={data.traffic.uniqueVisitors7d}
          />
        </div>
      </StatCard>

      <StatCard title={t("admin.overview.watchCard")}>
        <div className="flex flex-col gap-1.5">
          <Stat
            label={t("admin.overview.totalWatchTime")}
            value={fmtSeconds(data.watch.totalSeconds)}
          />
          <Stat label={t("admin.overview.sessions")} value={data.watch.sessionCount} />
        </div>
      </StatCard>

      <StatCard title={t("admin.overview.topReferrers")}>
        {data.topReferrers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.overview.noData")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.topReferrers.map((r) => (
              <Stat
                key={r.host}
                label={r.host === "direct" ? t("admin.overview.direct") : r.host}
                value={r.count}
              />
            ))}
          </div>
        )}
      </StatCard>

      <StatCard title={t("admin.overview.topPaths")}>
        {data.traffic.topPaths.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.overview.noData")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.traffic.topPaths.map((p) => (
              <Stat key={p.path} label={p.path} value={p.count} />
            ))}
          </div>
        )}
      </StatCard>

      <StatCard title={t("admin.overview.topAnime")}>
        {data.topAnime.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.overview.noData")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.topAnime.slice(0, 8).map((a) => (
              <Stat key={a.id} label={a.title} value={a.viewCount} />
            ))}
          </div>
        )}
      </StatCard>
    </div>
  );
}

/* ---------------- shared: pager ---------------- */

function Pager({
  page,
  hasNextPage,
  onChange,
}: {
  page: number;
  hasNextPage: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">{page}</span>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!hasNextPage}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

/* ---------------- users ---------------- */

function UsersTab() {
  const t = useT();
  const { user: viewer } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query);
  const { data, isPending, isError, refetch } = useAdminUsers({
    query: debouncedQuery || undefined,
    page,
  });
  const setUser = useAdminSetUser();

  const onRoleChange = (row: AdminUserSummary, isAdmin: boolean) => {
    setUser.mutate(
      { id: row.id, input: { role: isAdmin ? "ADMIN" : "USER" } },
      { onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))) },
    );
  };
  const onBanChange = (row: AdminUserSummary, banned: boolean) => {
    setUser.mutate(
      { id: row.id, input: { isBanned: banned } },
      { onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))) },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={t("admin.users.searchPlaceholder")}
        className="max-w-sm"
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("admin.users.emptyTitle")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.users.columns.user")}</TableHead>
                <TableHead>{t("admin.users.columns.joined")}</TableHead>
                <TableHead>{t("admin.users.columns.telegram")}</TableHead>
                <TableHead>{t("admin.users.columns.role")}</TableHead>
                <TableHead>{t("admin.users.columns.banned")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{row.displayName}</span>
                      <span className="text-xs text-muted-foreground">{row.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {row.hasTelegram ? (
                      <Badge variant="secondary">Telegram</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.role === "ADMIN"}
                      disabled={setUser.isPending || row.id === viewer?.id}
                      onCheckedChange={(checked) => onRoleChange(row, checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.isBanned}
                      disabled={setUser.isPending || row.id === viewer?.id}
                      onCheckedChange={(checked) => onBanChange(row, checked)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && (
        <Pager page={page} hasNextPage={data.meta.hasNextPage} onChange={setPage} />
      )}
    </div>
  );
}

/* ---------------- comments ---------------- */

function TruncatedBody({ body }: { body: string }) {
  return (
    <p className="line-clamp-2 max-w-md text-sm" title={body}>
      {body}
    </p>
  );
}

function CommentsTab() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query);
  const { data, isPending, isError, refetch } = useAdminComments({
    query: debouncedQuery || undefined,
    page,
  });
  const del = useAdminDeleteComment();
  const [pendingDelete, setPendingDelete] = useState<AdminCommentSummary | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={t("admin.comments.searchPlaceholder")}
        className="max-w-sm"
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("admin.comments.emptyTitle")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.comments.columns.author")}</TableHead>
                <TableHead>{t("admin.comments.columns.anime")}</TableHead>
                <TableHead>{t("admin.comments.columns.body")}</TableHead>
                <TableHead>{t("admin.comments.columns.date")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.authorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.animeTitle}
                  </TableCell>
                  <TableCell>
                    {row.deleted ? (
                      <Badge variant="outline">{t("admin.comments.deleted")}</Badge>
                    ) : (
                      <TruncatedBody body={row.body} />
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {!row.deleted && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete(row)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && (
        <Pager page={page} hasNextPage={data.meta.hasNextPage} onChange={setPage} />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("admin.comments.confirmDeleteTitle")}
        description={t("admin.comments.confirmDeleteBody")}
        pending={del.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          del.mutate(pendingDelete.id, {
            onSuccess: () => toast.success(t("admin.comments.deletedToast")),
            onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
          });
        }}
      />
    </div>
  );
}

/* ---------------- reviews ---------------- */

function ReviewsTab() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query);
  const { data, isPending, isError, refetch } = useAdminReviews({
    query: debouncedQuery || undefined,
    page,
  });
  const del = useAdminDeleteReview();
  const [pendingDelete, setPendingDelete] = useState<AdminReviewSummary | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder={t("admin.reviews.searchPlaceholder")}
        className="max-w-sm"
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t("admin.reviews.emptyTitle")} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.reviews.columns.author")}</TableHead>
                <TableHead>{t("admin.reviews.columns.anime")}</TableHead>
                <TableHead>{t("admin.reviews.columns.rating")}</TableHead>
                <TableHead>{t("admin.reviews.columns.body")}</TableHead>
                <TableHead>{t("admin.reviews.columns.date")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.authorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.animeTitle}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "font-medium tabular-nums",
                      row.rating <= 4 && "text-destructive",
                    )}
                  >
                    {row.rating}/10
                  </TableCell>
                  <TableCell>
                    <TruncatedBody body={row.body} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(row)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && (
        <Pager page={page} hasNextPage={data.meta.hasNextPage} onChange={setPage} />
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("admin.reviews.confirmDeleteTitle")}
        description={t("admin.reviews.confirmDeleteBody")}
        pending={del.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          del.mutate(pendingDelete.id, {
            onSuccess: () => toast.success(t("admin.reviews.deletedToast")),
            onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
          });
        }}
      />
    </div>
  );
}
