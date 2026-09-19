import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboardIcon,
  type LucideIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AdminComments } from "@/components/admin/admin-comments";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { ENTER, LiveDot } from "@/components/admin/admin-ui";
import { AdminUsers } from "@/components/admin/admin-users";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { useAdminOverview } from "@/lib/query";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

const TABS = ["dashboard", "users", "comments"] as const;
type AdminTab = (typeof TABS)[number];

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  users: UsersIcon,
  comments: MessageSquareIcon,
};

function isAdminTab(value: string | null): value is AdminTab {
  return (TABS as readonly string[]).includes(value ?? "");
}

export function Component() {
  const { status, user } = useAuth();

  if (status === "loading") return <AdminSkeleton />;
  // Cosmetic only — every /admin/* endpoint re-checks the role server-side.
  if (status !== "authenticated" || user?.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return <AdminPanel />;
}

function AdminSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}

function AdminPanel() {
  const t = useT();
  const { locale } = useLocale();
  const client = useQueryClient();
  const refreshing = useIsFetching({ queryKey: ["admin"] }) > 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AdminTab = isAdminTab(tabParam) ? tabParam : "dashboard";

  const overview = useAdminOverview();
  const counts: Partial<Record<AdminTab, number>> = overview.data
    ? {
        users: overview.data.kpis.users.total,
        comments: overview.data.kpis.comments.total,
      }
    : {};
  const updatedAt = overview.dataUpdatedAt
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
        overview.dataUpdatedAt,
      )
    : null;

  const select = (next: AdminTab) =>
    setSearchParams(next === "dashboard" ? {} : { tab: next }, { replace: true });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <header
        className={cn(
          ENTER,
          "relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-border/60 bg-card/70 px-5 py-4 shadow-sm backdrop-blur sm:px-6",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 120% at 0% 0%, color-mix(in oklab, var(--chart-1) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-2xl text-primary ring-1 ring-primary/25">
            <SlicedGlyph />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-tight sm:text-2xl">{t("admin.title")}</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">{t("admin.subtitle")}</p>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          {overview.data && (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <LiveDot />
              {t("admin.activeToday", { count: overview.data.audience.activeToday })}
            </span>
          )}
          {updatedAt && (
            <span className="hidden items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
              {t("admin.updated")}
              <span className="tabular-nums text-foreground">{updatedAt}</span>
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={refreshing}
            onClick={() => void client.invalidateQueries({ queryKey: ["admin"] })}
          >
            <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
            <span className="hidden sm:inline">{t("admin.refresh")}</span>
          </Button>
        </div>
      </header>

      {/* Sections: a sidebar on wide screens, a scrolling strip on phones. */}
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label={t("admin.title")}
          className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:sticky lg:top-20 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-2xl lg:border lg:border-border/60 lg:bg-card/60 lg:p-2 lg:backdrop-blur"
        >
          {TABS.map((value) => {
            const Icon = TAB_ICONS[value];
            const count = counts[value];
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => select(value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-all lg:py-2.5",
                  active
                    ? "border-primary/30 bg-primary/15 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{t(`admin.tabs.${value}`)}</span>
                  <span className="hidden text-[11px] leading-tight text-muted-foreground lg:block">
                    {t(`admin.tabHints.${value}`)}
                  </span>
                </span>
                {count != null && (
                  <span className="ml-auto rounded-full bg-foreground/10 px-1.5 py-px text-[10px] tabular-nums">
                    {count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="min-w-0">
          {tab === "dashboard" && <AdminDashboard />}
          {tab === "users" && <AdminUsers />}
          {tab === "comments" && <AdminComments />}
        </main>
      </div>
    </div>
  );
}
