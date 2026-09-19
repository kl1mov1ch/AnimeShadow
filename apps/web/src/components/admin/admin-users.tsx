import type { AdminUserQuery, AdminUserSummary } from "@animeshadow/shared";
import {
  ArrowUpDownIcon,
  BanIcon,
  BookmarkIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  SendIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLocale, useT } from "@/i18n";
import { useAdminUsers } from "@/lib/query";
import { cn } from "@/lib/utils";
import { AdminUserSheet } from "./admin-user-sheet";
import {
  FilterSelect,
  isOnline,
  SearchInput,
  TablePager,
  TableShell,
  TableSkeleton,
  timeAgo,
  useFormatDuration,
  UserAvatar,
} from "./admin-ui";

/**
 * Everyone, as a table built for scanning: who they are, when they were
 * last here, how much they watch and write, and their standing. Reading
 * only — every action lives in the user panel a click on the row opens,
 * so a stray click in a list can never ban someone.
 */
export function AdminUsers() {
  const t = useT();
  const { locale } = useLocale();
  const { user: viewer } = useAuth();
  const formatDuration = useFormatDuration();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("user");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<AdminUserQuery["role"]>("all");
  const [status, setStatus] = useState<AdminUserQuery["status"]>("all");
  const [sort, setSort] = useState<AdminUserQuery["sort"]>("lastSeen");
  const [page, setPage] = useState(1);
  const query = useDebouncedValue(search.trim());

  const { data, isPending, isError, isFetching, refetch } = useAdminUsers({
    ...(query ? { query } : {}),
    role,
    status,
    sort,
    page,
  });
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  // The open user lives in the URL, so a panel can be linked to and the
  // back button closes it.
  const openUser = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("user", id);
    else next.delete("user");
    setSearchParams(next, { replace: !id });
  };

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
              placeholder={t("admin.users.searchPlaceholder")}
            />
            <FilterSelect
              value={sort}
              onChange={resettingPage(setSort)}
              icon={<ArrowUpDownIcon />}
              options={[
                { value: "lastSeen", label: t("admin.users.sortLastSeen") },
                { value: "newest", label: t("admin.users.sortNewest") },
                { value: "oldest", label: t("admin.users.sortOldest") },
                { value: "comments", label: t("admin.users.sortComments") },
                { value: "library", label: t("admin.users.sortLibrary") },
                { value: "name", label: t("admin.users.sortName") },
              ]}
            />
            <FilterSelect
              value={role}
              onChange={resettingPage(setRole)}
              icon={<ShieldIcon />}
              options={[
                { value: "all", label: t("admin.users.roleAll") },
                { value: "USER", label: t("admin.users.roleUser") },
                { value: "ADMIN", label: t("admin.users.roleAdmin") },
              ]}
            />
            <FilterSelect
              value={status}
              onChange={resettingPage(setStatus)}
              icon={<CircleCheckIcon />}
              options={[
                { value: "all", label: t("admin.users.statusAll") },
                { value: "active", label: t("admin.users.statusActive") },
                { value: "banned", label: t("admin.users.statusBanned") },
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
            <p className="w-full text-xs text-muted-foreground">{t("admin.users.hint")}</p>
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
            <EmptyState title={t("admin.users.emptyTitle")} description={t("admin.users.emptyBody")} />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">{t("admin.users.columns.user")}</TableHead>
                  <TableHead>{t("admin.users.lastSeen")}</TableHead>
                  <TableHead>{t("admin.users.watchTime")}</TableHead>
                  <TableHead>{t("admin.users.columns.activity")}</TableHead>
                  <TableHead>{t("admin.users.columns.joined")}</TableHead>
                  <TableHead className="pr-4 text-right">{t("admin.users.columns.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <UserRow
                    key={row.id}
                    row={row}
                    isSelf={row.id === viewer?.id}
                    selected={row.id === openId}
                    onOpen={() => openUser(row.id)}
                    joined={timeAgo(row.createdAt, locale)}
                    joinedFull={fullDate.format(new Date(row.createdAt))}
                    lastSeen={row.lastSeenAt ? timeAgo(row.lastSeenAt, locale) : null}
                    lastSeenFull={row.lastSeenAt ? fullDate.format(new Date(row.lastSeenAt)) : null}
                    watch={row.watchSeconds > 0 ? formatDuration(row.watchSeconds) : "—"}
                  />
                ))}
              </TableBody>
            </Table>
            <TablePager meta={data.meta} count={data.items.length} onPage={setPage} />
          </>
        )}
      </TableShell>

      <AdminUserSheet userId={openId} onClose={() => openUser(null)} />
    </>
  );
}

function UserRow({
  row,
  isSelf,
  selected,
  onOpen,
  joined,
  joinedFull,
  lastSeen,
  lastSeenFull,
  watch,
}: {
  row: AdminUserSummary;
  isSelf: boolean;
  selected: boolean;
  onOpen: () => void;
  joined: string;
  joinedFull: string;
  lastSeen: string | null;
  lastSeenFull: string | null;
  watch: string;
}) {
  const t = useT();
  const online = isOnline(row.lastSeenAt);
  const telegramOnly = row.email.endsWith("@telegram.local");

  return (
    <TableRow
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      aria-label={`${t("admin.users.open")}: ${row.displayName}`}
      className={cn(
        "group cursor-pointer outline-none focus-visible:bg-primary/5",
        row.isBanned && "bg-destructive/[0.04]",
        selected && "bg-primary/[0.07]",
      )}
    >
      <TableCell className="py-3 pl-4">
        <div className="flex min-w-[15rem] items-center gap-3">
          <span className="relative shrink-0">
            <UserAvatar name={row.displayName} url={row.avatarUrl} className={cn(row.isBanned && "opacity-50 grayscale")} />
            {online && (
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-card" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="truncate transition-colors group-hover:text-primary">{row.displayName}</span>
              {isSelf && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {t("admin.users.you")}
                </Badge>
              )}
              {row.role === "ADMIN" && <ShieldCheckIcon aria-label="Admin" className="size-3.5 shrink-0 text-primary" />}
              {row.isPro && <SparklesIcon aria-label="PRO" className="size-3.5 shrink-0 text-amber-500" />}
              {row.hasTelegram && <SendIcon aria-label="Telegram" className="size-3.5 shrink-0 text-sky-500" />}
            </div>
            <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
              {row.username ? `@${row.username} · ` : ""}
              {telegramOnly ? t("admin.users.telegramAccount") : row.email}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {online ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t("admin.users.online")}
          </span>
        ) : lastSeen ? (
          <Tooltip>
            <TooltipTrigger className="whitespace-nowrap text-sm text-muted-foreground">{lastSeen}</TooltipTrigger>
            <TooltipContent>{lastSeenFull}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-sm text-muted-foreground/50">{t("admin.users.never")}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm tabular-nums">{watch}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-xs">
          <Chip icon={<BookmarkIcon />} value={row.libraryCount} label={t("admin.users.library")} />
          <Chip icon={<MessageSquareIcon />} value={row.commentCount} label={t("admin.users.comments")} />
        </div>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger className="whitespace-nowrap text-sm text-muted-foreground">{joined}</TooltipTrigger>
          <TooltipContent>{joinedFull}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="pr-4">
        <div className="flex items-center justify-end gap-2">
          {row.isBanned ? (
            <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive">
              <BanIcon className="size-3" />
              {t("admin.users.statusBanned")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CircleCheckIcon className="size-3" />
              {t("admin.users.statusActive")}
            </Badge>
          )}
          <ChevronRightIcon className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
      </TableCell>
    </TableRow>
  );
}

function Chip({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 tabular-nums [&_svg]:size-3",
            value > 0 ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {icon}
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
