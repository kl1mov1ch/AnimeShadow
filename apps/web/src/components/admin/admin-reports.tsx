import { type AdminReportGroup, type AdminReportQuery, REPORT_MEASURES, type ReportMeasure } from "@animeshadow/shared";
import {
  BanIcon,
  ExternalLinkIcon,
  FilterIcon,
  FlagIcon,
  ImageOffIcon,
  Loader2Icon,
  MessageSquareXIcon,
  ShieldCheckIcon,
  TextCursorInputIcon,
  UserRoundXIcon,
  UserSearchIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { useLocale, useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useAdminReports, useAdminResolveReports } from "@/lib/query";
import { cn } from "@/lib/utils";
import { AdminUserSheet } from "./admin-user-sheet";
import { errorMessage, FilterSelect, TablePager, TableShell, TableSkeleton, timeAgo, UserAvatar } from "./admin-ui";

const MEASURE_ICON: Record<ReportMeasure, typeof BanIcon> = {
  avatar: UserRoundXIcon,
  banner: ImageOffIcon,
  bio: TextCursorInputIcon,
  wall: MessageSquareXIcon,
  ban: BanIcon,
};

/**
 * Complaints about profiles, one card per profile: the profile as it is
 * now (cover, picture, description) beside what people said about it, and
 * the decision — dismiss, or pick the measures and take them. One decision
 * closes every open complaint about that profile.
 */
export function AdminReports() {
  const t = useT();
  const [status, setStatus] = useState<AdminReportQuery["status"]>("open");
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const { data, isPending, isError, isFetching, refetch } = useAdminReports({ status, page });

  return (
    <>
      <TableShell
        toolbar={
          <>
            <FilterSelect
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              icon={<FilterIcon />}
              options={[
                { value: "open", label: t("admin.reports.statusOpen") },
                { value: "resolved", label: t("admin.reports.statusResolved") },
                { value: "dismissed", label: t("admin.reports.statusDismissed") },
                { value: "all", label: t("admin.reports.statusAll") },
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              {isFetching && !isPending && <Loader2Icon className="size-4 animate-spin text-muted-foreground" />}
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
            <EmptyState title={t("admin.reports.emptyTitle")} description={t("admin.reports.emptyBody")} />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 p-3 sm:p-4">
              {data.items.map((group) => (
                <ReportCard key={group.target.id} group={group} onUser={setUserId} />
              ))}
            </div>
            <TablePager meta={data.meta} count={data.items.length} onPage={setPage} />
          </>
        )}
      </TableShell>
      <AdminUserSheet userId={userId} onClose={() => setUserId(null)} />
    </>
  );
}

function ReportCard({ group, onUser }: { group: AdminReportGroup; onUser: (id: string) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const { target } = group;

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-background/50">
      {/* The profile as visitors see it: cover, picture, name. */}
      <header className="relative">
        <div className={cn("bg-muted/40", target.bannerUrl ? "h-20 sm:h-24" : "h-12")}>
          {target.bannerUrl && <img src={imageSrc(target.bannerUrl)} alt="" loading="lazy" className="size-full object-cover" />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="relative -mt-10 flex flex-wrap items-end gap-3 px-4 pb-3">
          <UserAvatar name={target.displayName} url={target.avatarUrl} className="size-16 ring-2 ring-background" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-base font-semibold">{target.displayName}</span>
              {target.isBanned && (
                <Badge variant="outline" className="border-rose-500/40 text-rose-500">
                  {t("admin.reports.banned")}
                </Badge>
              )}
              {target.role === "ADMIN" && <Badge variant="outline">{t("admin.reports.admin")}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {target.username ? `@${target.username}` : target.id} · {t("admin.reports.complaints", { n: group.total })}
              {group.open > 0 && <span className="font-semibold text-amber-500"> · {t("admin.reports.open", { n: group.open })}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {target.username && (
              <Link
                to={`/profile/${target.username}`}
                target="_blank"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ExternalLinkIcon className="size-3.5" />
                {t("admin.reports.openProfile")}
              </Link>
            )}
            <button
              type="button"
              onClick={() => onUser(target.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              <UserSearchIcon className="size-3.5" />
              {t("admin.reports.openUser")}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 border-t border-border/60 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <p className={cn("whitespace-pre-line rounded-xl bg-muted/30 px-3 py-2 text-sm", !target.bio && "italic text-muted-foreground")}>
            {target.bio ?? t("admin.reports.noBio")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.reasons.map((r) => (
              <span key={r.reason} className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-300">
                <FlagIcon className="size-3" />
                {t(`admin.reports.reasons.${r.reason}` as "admin.reports.reasons.spam")}
                <span className="tabular-nums opacity-70">×{r.count}</span>
              </span>
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-border/50">
            {group.reports.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 py-2">
                <UserAvatar name={r.reporter.displayName} url={r.reporter.avatarUrl} className="size-7" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{t(`admin.reports.reasons.${r.reason}` as "admin.reports.reasons.spam")}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("admin.reports.from", { name: r.reporter.displayName })} · {timeAgo(r.createdAt, locale)}
                    </span>
                    {r.status !== "OPEN" && (
                      <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                        {r.status === "RESOLVED" ? t("admin.reports.decisionResolved") : t("admin.reports.decisionDismissed")}
                      </Badge>
                    )}
                  </div>
                  {r.comment && <p className="mt-0.5 whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">{r.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="flex flex-col gap-3">
          {group.decision && <Decision decision={group.decision} />}
          {group.open > 0 && <DecisionForm group={group} />}
        </aside>
      </div>
    </article>
  );
}

function Decision({ decision }: { decision: NonNullable<AdminReportGroup["decision"]> }) {
  const t = useT();
  const { locale } = useLocale();
  const resolved = decision.status === "RESOLVED";
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 text-xs", resolved ? "border-emerald-500/30 bg-emerald-500/10" : "border-border/70 bg-muted/30")}>
      <div className="flex items-center gap-1.5 font-semibold">
        {resolved ? <ShieldCheckIcon className="size-3.5 text-emerald-500" /> : <XIcon className="size-3.5" />}
        {resolved ? t("admin.reports.decisionResolved") : t("admin.reports.decisionDismissed")}
        <span className="ml-auto font-normal text-muted-foreground">
          {decision.by ?? ""} · {timeAgo(decision.at, locale)}
        </span>
      </div>
      {decision.measures.length > 0 && (
        <p className="mt-1 text-muted-foreground">{decision.measures.map((m) => t(`admin.reports.done.${m}` as "admin.reports.done.ban")).join(", ")}</p>
      )}
      {decision.note && <p className="mt-1 whitespace-pre-line">{decision.note}</p>}
    </div>
  );
}

function DecisionForm({ group }: { group: AdminReportGroup }) {
  const t = useT();
  const resolve = useAdminResolveReports();
  const [measures, setMeasures] = useState<ReportMeasure[]>([]);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);

  const toggle = (m: ReportMeasure) => setMeasures((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]));
  const send = (action: "resolve" | "dismiss") =>
    resolve.mutate(
      { targetId: group.target.id, input: { action, measures: action === "resolve" ? measures : [], ...(note.trim() ? { note: note.trim() } : {}) } },
      {
        onSuccess: () => {
          toast.success(action === "resolve" ? t("admin.reports.resolvedToast") : t("admin.reports.dismissedToast"));
          setConfirm(false);
        },
        onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
      },
    );

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("admin.reports.measuresTitle")}</p>
      <div className="flex flex-col gap-1.5">
        {REPORT_MEASURES.map((m) => {
          const on = measures.includes(m);
          const Icon = MEASURE_ICON[m];
          const danger = m === "ban";
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(m)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                on
                  ? danger
                    ? "border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                    : "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border/70 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded border text-[10px] leading-none",
                  on ? (danger ? "border-rose-500 bg-rose-500 text-white" : "border-primary bg-primary text-primary-foreground") : "border-border",
                )}
              >
                {on && "✓"}
              </span>
              <Icon className="size-4 shrink-0" />
              {t(`admin.reports.measures.${m}` as "admin.reports.measures.ban")}
            </button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder={t("admin.reports.notePlaceholder")}
        className="w-full resize-y rounded-lg border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={resolve.isPending}
          onClick={() => send("dismiss")}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 text-sm font-medium transition-colors hover:border-foreground/30 disabled:opacity-60"
        >
          <XIcon className="size-4" />
          {t("admin.reports.dismiss")}
        </button>
        <button
          type="button"
          disabled={resolve.isPending || measures.length === 0}
          title={measures.length === 0 ? t("admin.reports.pickMeasure") : undefined}
          onClick={() => setConfirm(true)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <ShieldCheckIcon className="size-4" />
          {t("admin.reports.takeMeasures")}
        </button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("admin.reports.confirmTitle")}
        description={`${measures.map((m) => t(`admin.reports.measures.${m}` as "admin.reports.measures.ban")).join(", ")}. ${t("admin.reports.confirmBody")}${
          measures.includes("ban") ? ` ${t("admin.reports.confirmBan")}` : ""
        }`}
        pending={resolve.isPending}
        confirmLabel={t("admin.reports.takeMeasures")}
        onConfirm={() => send("resolve")}
      />
    </div>
  );
}
