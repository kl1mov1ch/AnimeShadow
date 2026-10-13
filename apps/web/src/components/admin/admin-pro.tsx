import type { AdminProAction, AdminProQuery, AdminProRow, AdminProStats, Paginated, ProStatus } from "@animeshadow/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgePercentIcon,
  CalendarPlusIcon,
  CircleOffIcon,
  CrownIcon,
  FilterIcon,
  GiftIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  TimerOffIcon,
} from "lucide-react";
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
  pro: { label: "PRO навсегда", className: "border-amber-300/40 bg-amber-400/15 text-amber-200" },
  trial: { label: "Подарочный месяц", className: "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" },
  discount: { label: "Скидка −50%", className: "border-sky-300/40 bg-sky-400/15 text-sky-200" },
  used: { label: "Акция использована", className: "border-border bg-foreground/5 text-muted-foreground" },
  free: { label: "Без PRO", className: "border-border bg-foreground/5 text-muted-foreground" },
};

const FILTERS: ReadonlyArray<{ value: AdminProQuery["filter"]; label: string }> = [
  { value: "active", label: "С PRO сейчас" },
  { value: "pro", label: "PRO навсегда" },
  { value: "trial", label: "Подарочный месяц" },
  { value: "discount", label: "На скидке" },
  { value: "used", label: "Акция использована" },
  { value: "free", label: "Без PRO" },
  { value: "all", label: "Все аккаунты" },
];

const ACTION_DONE: Record<AdminProAction["action"], string> = {
  grant: "PRO выдан навсегда",
  revoke: "PRO снят",
  trial: "Подарочный месяц продлён",
  endTrial: "Подарочный месяц завершён",
  resetPromo: "Акция сброшена — можно забрать снова",
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
          { key: "pro" as const, icon: CrownIcon, label: "PRO навсегда", value: stats?.pro, tone: "text-amber-300 bg-amber-400/15" },
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
                    <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", s.className)}>{s.label}</span>
                    <span className="hidden w-44 shrink-0 text-xs text-muted-foreground md:block">
                      {u.status === "pro" ? (
                        <>с {date(u.proSince)}</>
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
                        {u.status !== "pro" && (
                          <DropdownMenuItem onSelect={() => act({ action: "grant" })}>
                            <CrownIcon className="text-amber-300" />
                            Выдать PRO навсегда
                          </DropdownMenuItem>
                        )}
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
