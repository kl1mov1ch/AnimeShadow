import type { AdminProAction, AdminProQuery, AdminProRow, AdminProStats, Paginated, ProStatus } from "@animeshadow/shared";
import { SecretAchievementsPanel } from "./admin-daily";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercentIcon, CalendarPlusIcon, CircleOffIcon, CrownIcon, FilterIcon, GiftIcon, MoreHorizontalIcon, RotateCcwIcon, TimerOffIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLocale } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EmptyBlock, errorMessage, FilterSelect, SearchInput, TablePager, TableShell, TableSkeleton, UserAvatar } from "./admin-ui";

type ProList = Paginated<AdminProRow> & { stats: AdminProStats };

const STATUS: Record<ProStatus, { label: string; className: string }> = {
  pro: { label: "PRO", className: "border-amber-300/40 bg-amber-400/15 text-amber-200" },
  trial: { label: "Подарочный месяц", className: "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" },
  discount: { label: "Скидка −50%", className: "border-sky-300/40 bg-sky-400/15 text-sky-200" },
  used: { label: "Акция использована", className: "border-border bg-foreground/5 text-muted-foreground" },
  free: { label: "Без PRO", className: "border-border bg-foreground/5 text-muted-foreground" },
};

const FILTERS: ReadonlyArray<{ value: AdminProQuery["filter"]; label: string }> = [
  { value: "active", label: "С PRO сейчас" },
  { value: "pro", label: "С PRO (без подарка)" },
  { value: "trial", label: "Подарочный месяц" },
  { value: "discount", label: "На скидке" },
  { value: "used", label: "Акция использована" },
  { value: "free", label: "Без PRO" },
  { value: "all", label: "Все аккаунты" },
];

const ACTION_DONE: Record<AdminProAction["action"], string> = {
  grant: "PRO выдан навсегда",
  grantDays: "PRO продлён",
  revoke: "PRO снят",
  trial: "Подарочный месяц продлён",
  endTrial: "Подарочный месяц завершён",
  resetPromo: "Акция сброшена — можно забрать снова",
  bonusReferrals: "Бонусные рефералы обновлены",
};

/**
 * The PRO accounts: how many are PRO for good, in the free month or on the
 * half-price one; a list to search and filter; and for each account every
 * change an admin may need — PRO for good (after a payment), more days of
 * the free month, ending it, taking PRO off, or giving the offer back.
 */
export function AdminPro() {
  const { locale } = useLocale();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminProQuery["filter"]>("active");
  const [page, setPage] = useState(1);
  const query = useDebouncedValue(search, 300);

  const list = useQuery({
    queryKey: ["admin", "pro", { query, filter, page }],
    queryFn: ({ signal }) =>
      apiRequest<ProList>("/admin/pro", { signal, query: { query: query || undefined, filter, page, perPage: 25 } }),
    placeholderData: keepPreviousData,
  });
  const change = useMutation({
    mutationFn: ({ id, action }: { id: string; action: AdminProAction }) =>
      apiRequest<AdminProRow>(`/admin/pro/${id}`, { method: "POST", body: action }),
    onSuccess: (row, { action }) => {
      toast.success(ACTION_DONE[action.action], { description: row.displayName });
      void client.invalidateQueries({ queryKey: ["admin", "pro"] });
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (error) => toast.error("Не получилось", { description: errorMessage(error, "Попробуйте ещё раз") }),
  });

  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);
  const stats = list.data?.stats;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { key: "pro" as const, icon: CrownIcon, label: "С PRO", value: stats?.pro, tone: "text-amber-300 bg-amber-400/15" },
          { key: "trial" as const, icon: GiftIcon, label: "В подарочном месяце", value: stats?.trial, tone: "text-emerald-300 bg-emerald-400/15" },
          { key: "discount" as const, icon: BadgePercentIcon, label: "На скидке −50%", value: stats?.discount, tone: "text-sky-300 bg-sky-400/15" },
        ].map(({ key, icon: Icon, label, value, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setFilter(key);
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-[var(--accent-surface)] p-4 text-left transition-colors hover:border-foreground/25",
              filter === key ? "border-primary/50" : "border-[var(--accent-line-soft)]",
            )}
          >
            <span className={cn("grid size-10 place-items-center rounded-xl", tone)}>
              <Icon className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="font-display text-2xl tabular-nums leading-none">{value ?? "—"}</span>
              <span className="mt-1 text-xs text-muted-foreground">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <ReferralPanel />
      <SecretAchievementsPanel />

      <TableShell
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Имя, почта, логин или id"
            />
            <FilterSelect
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              options={FILTERS}
              icon={<FilterIcon />}
            />
          </>
        }
      >
        {list.isPending ? (
          <TableSkeleton />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => void list.refetch()} />
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyBlock>Здесь пока никого</EmptyBlock>
          </div>
        ) : (
          <>
            <ul className={cn("flex flex-col divide-y divide-border/50", list.isFetching && "opacity-70")}>
              {list.data.items.map((u) => {
                const s = STATUS[u.status];
                const busy = change.isPending && change.variables?.id === u.id;
                const act = (action: AdminProAction) => change.mutate({ id: u.id, action });
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                    <UserAvatar name={u.displayName} url={u.avatarUrl} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{u.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {u.username ? `@${u.username} · ` : ""}
                        {u.email}
                      </span>
                    </div>
                    {u.bonusReferrals > 0 && (
                      <span className="shrink-0 rounded-full border border-sky-300/40 bg-sky-400/10 px-2 py-0.5 text-[11px] font-semibold text-sky-200">
                        +{u.bonusReferrals} реф.
                      </span>
                    )}
                    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", s.className)}>{s.label}</span>
                    <span className="hidden w-44 shrink-0 text-xs text-muted-foreground md:block">
                      {u.status === "pro" ? (
                        u.proUntil ? (
                          <>
                            до {date(u.proUntil)} · <b className="text-foreground">{daysLeft(u.proUntil)} дн.</b>
                          </>
                        ) : (
                          <>навсегда · с {date(u.proSince)}</>
                        )
                      ) : u.status === "trial" ? (
                        <>
                          до {date(u.trialUntil)} · <b className="text-foreground">{daysLeft(u.trialUntil)} дн.</b>
                        </>
                      ) : u.trialUntil ? (
                        <>месяц кончился {date(u.trialUntil)}</>
                      ) : (
                        <>с нами с {date(u.createdAt)}</>
                      )}
                    </span>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={busy} className="shrink-0 gap-1.5">
                          <MoreHorizontalIcon />
                          Управлять
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-60">
                        <DropdownMenuLabel className="truncate text-xs text-muted-foreground">{u.displayName}</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => act({ action: "grantDays", days: 30 })}>
                          <CrownIcon className="text-amber-300" />
                          {u.status === "pro" && u.proUntil ? "Продлить PRO на месяц" : "PRO на 1 месяц"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => act({ action: "grantDays", days: 90 })}>
                          <CrownIcon className="text-amber-300" />
                          {u.status === "pro" && u.proUntil ? "Продлить PRO на 3 месяца" : "PRO на 3 месяца"}
                        </DropdownMenuItem>
                        {!(u.status === "pro" && !u.proUntil) && (
                          <DropdownMenuItem onSelect={() => act({ action: "grant" })}>
                            <CrownIcon className="text-amber-300" />
                            PRO навсегда
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => act({ action: "trial", days: 30 })}>
                          <CalendarPlusIcon className="text-emerald-300" />
                          {u.status === "trial" ? "Продлить подарок на 30 дней" : "Подарить 30 дней PRO"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => act({ action: "trial", days: 7 })}>
                          <CalendarPlusIcon className="text-emerald-300" />
                          {u.status === "trial" ? "Продлить на 7 дней" : "Подарить 7 дней PRO"}
                        </DropdownMenuItem>
                        {u.status === "trial" && (
                          <DropdownMenuItem onSelect={() => act({ action: "endTrial" })}>
                            <TimerOffIcon />
                            Завершить подарочный месяц
                          </DropdownMenuItem>
                        )}
                        {u.trialUntil && (
                          <DropdownMenuItem onSelect={() => act({ action: "resetPromo" })}>
                            <RotateCcwIcon />
                            Сбросить акцию
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => act({ action: "bonusReferrals", count: 1 })}>
                          <UsersIcon className="text-sky-300" />
                          +1 реферал
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => act({ action: "bonusReferrals", count: 5 })}>
                          <UsersIcon className="text-sky-300" />
                          +5 рефералов
                        </DropdownMenuItem>
                        {u.bonusReferrals > 0 && (
                          <DropdownMenuItem onSelect={() => act({ action: "bonusReferrals", count: -u.bonusReferrals })}>
                            <RotateCcwIcon />
                            Убрать бонусных рефералов ({u.bonusReferrals})
                          </DropdownMenuItem>
                        )}
                        {(u.status === "pro" || u.status === "trial") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive [&_svg]:text-destructive"
                              onSelect={() => act({ action: "revoke" })}
                            >
                              <CircleOffIcon />
                              Снять PRO
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
            <TablePager meta={list.data.meta} count={list.data.items.length} onPage={setPage} />
          </>
        )}
      </TableShell>
    </div>
  );
}

type ReferralOverview = {
  referred: number;
  inviters: number;
  rewardsTaken: number;
  top: Array<{ id: string; displayName: string; email: string; avatarUrl: string | null; friends: number; rewards: number }>;
};

/** Invites at a glance: how many came by a friend's code, how many invited, rewards taken, the top inviters. */
function ReferralPanel() {
  const { data } = useQuery({
    queryKey: ["admin", "referrals"],
    queryFn: ({ signal }) => apiRequest<ReferralOverview>("/admin/referrals", { signal }),
  });
  if (!data) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="flex items-center gap-2 font-display text-base">
          <UsersIcon className="size-4 text-primary" />
          Приглашения
        </h2>
        <span className="text-xs text-muted-foreground">
          пришли по коду: <b className="text-foreground">{data.referred}</b>
        </span>
        <span className="text-xs text-muted-foreground">
          пригласивших: <b className="text-foreground">{data.inviters}</b>
        </span>
        <span className="text-xs text-muted-foreground">
          наград выдано: <b className="text-foreground">{data.rewardsTaken}</b>
        </span>
      </div>
      {data.top.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.top.slice(0, 8).map((u, i) => (
            <li key={u.id} className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-background/30 p-2">
              <span className="w-4 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
              <UserAvatar name={u.displayName} url={u.avatarUrl} className="size-8" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{u.displayName}</span>
                <span className="truncate text-[11px] text-muted-foreground">{u.email}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                <b className="block text-sm text-foreground">{u.friends}</b>
                наград {u.rewards}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
