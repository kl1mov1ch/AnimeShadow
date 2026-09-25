import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  GaugeIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AdminComments } from "@/components/admin/admin-comments";
import { AdminMonitoringTab } from "@/components/admin/admin-monitoring";
import { AdminOverviewTab } from "@/components/admin/admin-overview";
import { LiveDot } from "@/components/admin/admin-ui";
import { AdminUsers } from "@/components/admin/admin-users";
import { PageHero } from "@/components/common/page-hero";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { useAdminOverview } from "@/lib/query";
import { cn } from "@/lib/utils";

const TABS = ["overview", "monitoring", "users", "comments"] as const;
type AdminTab = (typeof TABS)[number];

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
  overview: LayoutDashboardIcon,
  monitoring: GaugeIcon,
  users: UsersIcon,
  comments: MessageSquareIcon,
};

function isAdminTab(value: string | null): value is AdminTab {
  return (TABS as readonly string[]).includes(value ?? "");
}

export function Component() {
  const { status, user } = useAuth();
  if (status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }
  // Cosmetic only — every /admin/* endpoint re-checks the role server-side.
  if (status !== "authenticated" || user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return <AdminPanel />;
}

/**
 * The admin page, rebuilt: the site's own hero on top, the sections as one
 * sticky tab strip under it (it was a sidebar that took a sixth of the width
 * away from the tables), and the overview and monitoring written around the
 * split that matters now — signed-in visitors next to guests.
 */
function AdminPanel() {
  const t = useT();
  const { locale } = useLocale();
  const client = useQueryClient();
  const refreshing = useIsFetching({ queryKey: ["admin"] }) > 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: AdminTab = isAdminTab(tabParam) ? tabParam : "overview";
  const overview = useAdminOverview();

  const counts: Partial<Record<AdminTab, number>> = overview.data
    ? { users: overview.data.kpis.users.total, comments: overview.data.kpis.comments.total }
    : {};
  const today = overview.data?.split?.find((s) => s.window === "today");
  const updatedAt = overview.dataUpdatedAt
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(overview.dataUpdatedAt)
    : null;

  const select = (next: AdminTab) => setSearchParams(next === "overview" ? {} : { tab: next }, { replace: true });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <PageHero icon={ShieldCheckIcon} eyebrow={t("admin.x.eyebrow")} title={t("admin.title")} lead={t("admin.subtitle")}>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {today && (
            <>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <LiveDot />
                {t("admin.x.todayRegistered", { n: today.registered.visitors })}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-600 dark:text-sky-300">
                <span className="size-2 rounded-full bg-sky-400" />
                {t("admin.x.todayGuests", { n: today.guests.visitors })}
              </span>
            </>
          )}
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              {t("admin.updated")} <span className="tabular-nums text-foreground">{updatedAt}</span>
            </span>
          )}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void client.invalidateQueries({ queryKey: ["admin"] })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
            {t("admin.refresh")}
          </button>
        </div>
      </PageHero>

      <nav
        aria-label={t("admin.title")}
        className="sticky top-14 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-[var(--accent-line-soft)] bg-background/95 p-1 [scrollbar-width:none]"
      >
        {TABS.map((value) => {
          const Icon = TAB_ICONS[value];
          const active = tab === value;
          const count = counts[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
              )}
            >
              <Icon className="size-4" />
              {t(`admin.tabs.${value}` as "admin.tabs.users")}
              {count != null && (
                <span className={cn("rounded px-1.5 text-[10px] tabular-nums", active ? "bg-black/20" : "bg-primary/10 text-primary")}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div key={tab} className="min-w-0 animate-in fade-in-0 duration-300">
        {tab === "overview" && <AdminOverviewTab />}
        {tab === "monitoring" && <AdminMonitoringTab />}
        {tab === "users" && <AdminUsers />}
        {tab === "comments" && <AdminComments />}
      </div>
    </div>
  );
}
