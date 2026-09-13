import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboardIcon,
  type LucideIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  StarIcon,
  UsersIcon,
} from "lucide-react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AdminComments } from "@/components/admin/admin-comments";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminReviews } from "@/components/admin/admin-reviews";
import { ENTER, LiveDot } from "@/components/admin/admin-ui";
import { AdminUsers } from "@/components/admin/admin-users";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { useAdminOverview } from "@/lib/query";
import { cn } from "@/lib/utils";

const TABS = ["dashboard", "users", "comments", "reviews"] as const;
type AdminTab = (typeof TABS)[number];

const TAB_ICONS: Record<AdminTab, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  users: UsersIcon,
  comments: MessageSquareIcon,
  reviews: StarIcon,
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
        reviews: overview.data.kpis.reviews.total,
      }
    : {};
  const updatedAt = overview.dataUpdatedAt
    ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
        overview.dataUpdatedAt,
      )
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 sm:gap-6">
      <header
        className={cn(
          ENTER,
          "relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur sm:p-7",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 90% at 0% 0%, color-mix(in oklab, var(--chart-1) 16%, transparent), transparent 70%), radial-gradient(45% 80% at 100% 0%, color-mix(in oklab, var(--chart-2) 14%, transparent), transparent 70%)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-12 right-6 select-none font-display text-[9rem] leading-none text-foreground/[0.04]"
        >
          影
        </span>

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <LayoutDashboardIcon className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl leading-tight sm:text-3xl">{t("admin.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("admin.subtitle")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {updatedAt && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
                <LiveDot />
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
              {t("admin.refresh")}
            </Button>
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(next) =>
          setSearchParams(next === "dashboard" ? {} : { tab: next }, { replace: true })
        }
        className="gap-5"
      >
        <TabsList className="h-auto! w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/60 p-1.5 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((value) => {
            const Icon = TAB_ICONS[value];
            const count = counts[value];
            return (
              <TabsTrigger
                key={value}
                value={value}
                className="h-auto flex-none gap-2 rounded-xl border-transparent px-3.5 py-2 sm:px-4 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-primary dark:data-[state=active]:border-primary/30 dark:data-[state=active]:bg-primary/15 dark:data-[state=active]:text-primary"
              >
                <Icon className="size-4" />
                {t(`admin.tabs.${value}`)}
                {count != null && (
                  <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[10px] tabular-nums">
                    {count.toLocaleString()}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="dashboard">
          <AdminDashboard />
        </TabsContent>
        <TabsContent value="users">
          <AdminUsers />
        </TabsContent>
        <TabsContent value="comments">
          <AdminComments />
        </TabsContent>
        <TabsContent value="reviews">
          <AdminReviews />
        </TabsContent>
      </Tabs>
    </div>
  );
}
