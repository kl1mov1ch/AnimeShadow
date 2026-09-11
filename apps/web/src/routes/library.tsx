import { type LibraryStatus, libraryStatusSchema } from "@animeshadow/shared";
import { Link, useSearchParams } from "react-router-dom";
import { AnimeCard } from "@/components/anime/anime-card";
import { AnimeGridSkeleton } from "@/components/anime/anime-grid";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLibrary, useLibrarySummary } from "@/lib/query";

const STATUSES = libraryStatusSchema.options;

export function Component() {
  const t = useT();
  const { status: authStatus } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status");
  const activeStatus = STATUSES.includes(rawStatus as LibraryStatus)
    ? (rawStatus as LibraryStatus)
    : undefined;

  const isAuthed = authStatus === "authenticated";
  const { data: summary } = useLibrarySummary(isAuthed);
  const {
    data: entries,
    isPending,
    isError,
    refetch,
  } = useLibrary(activeStatus, isAuthed);

  if (authStatus === "loading") {
    return <AnimeGridSkeleton count={12} />;
  }

  if (!isAuthed) {
    return (
      <EmptyState
        title={t("library.signedOutTitle")}
        description={t("library.signedOutBody")}
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("common.createAccount")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete("status");
    else params.set("status", next);
    setSearchParams(params, { replace: true });
  };

  const total = summary?.total ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("library.title")}
        description={
          total > 0
            ? t("library.countTracked", { count: total })
            : t("library.nothingTracked")
        }
      />

      <ToggleGroup
        type="single"
        value={activeStatus ?? ""}
        onValueChange={setStatus}
        variant="outline"
        className="flex-wrap justify-start"
      >
        <ToggleGroupItem value="">
          {t("common.all")} ({total})
        </ToggleGroupItem>
        {STATUSES.map((status) => (
          <ToggleGroupItem key={status} value={status}>
            {t(`status.${status}`)}
            {summary?.byStatus?.[status] ? ` (${summary.byStatus[status]})` : ""}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <AnimeGridSkeleton count={12} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={
            activeStatus
              ? t("library.emptyStatusTitle", { status: t(`status.${activeStatus}`) })
              : t("library.emptyTitle")
          }
          description={t("library.emptyBody")}
          action={
            <Button asChild variant="outline">
              <Link to="/browse">{t("common.browseCatalogue")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {entries.map((entry) => (
            <div key={entry.anime.id} className="flex flex-col gap-2">
              <AnimeCard anime={entry.anime} />
              <div className="flex items-center justify-between gap-2 text-xs">
                <Badge variant="secondary" className="font-normal">
                  {t(`status.${entry.status}`)}
                </Badge>
                {entry.score != null && (
                  <span className="tabular-nums text-muted-foreground">
                    {entry.score}/10
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
