import type {
  AdminUpdateUserInput,
  AdminUserQuery,
  AdminUserSummary,
  Role,
} from "@animeshadow/shared";
import {
  ArrowUpDownIcon,
  BanIcon,
  BookmarkIcon,
  CircleCheckIcon,
  Loader2Icon,
  MessageSquareIcon,
  SendIcon,
  ShieldCheckIcon,
  ShieldIcon,
  StarIcon,
  UserIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAdminSetUser, useAdminUsers } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  FilterSelect,
  SearchInput,
  TablePager,
  TableShell,
  TableSkeleton,
  timeAgo,
  UserAvatar,
} from "./admin-ui";

function StatChip({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/50 px-1.5 py-0.5 tabular-nums [&_svg]:size-3",
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

export function AdminUsers() {
  const t = useT();
  const { locale } = useLocale();
  const { user: viewer } = useAuth();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<AdminUserQuery["role"]>("all");
  const [status, setStatus] = useState<AdminUserQuery["status"]>("all");
  const [sort, setSort] = useState<AdminUserQuery["sort"]>("newest");
  const [page, setPage] = useState(1);
  const query = useDebouncedValue(search.trim());

  const { data, isPending, isError, isFetching, refetch } = useAdminUsers({
    ...(query ? { query } : {}),
    role,
    status,
    sort,
    page,
  });
  const setUser = useAdminSetUser();
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const resettingPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const update = (
    row: AdminUserSummary,
    input: AdminUpdateUserInput,
    undo: AdminUpdateUserInput,
    message: string,
  ) => {
    setUser.mutate(
      { id: row.id, input },
      {
        onSuccess: () =>
          toast.success(message, {
            description: row.displayName,
            action: {
              label: t("admin.undo"),
              onClick: () => setUser.mutate({ id: row.id, input: undo }),
            },
          }),
        onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
      },
    );
  };

  return (
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
          <FilterSelect
            value={sort}
            onChange={resettingPage(setSort)}
            icon={<ArrowUpDownIcon />}
            options={[
              { value: "newest", label: t("admin.users.sortNewest") },
              { value: "oldest", label: t("admin.users.sortOldest") },
              { value: "name", label: t("admin.users.sortName") },
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
          <EmptyState title={t("admin.users.emptyTitle")} description={t("admin.users.emptyBody")} />
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{t("admin.users.columns.user")}</TableHead>
                <TableHead>{t("admin.users.columns.activity")}</TableHead>
                <TableHead>{t("admin.users.columns.joined")}</TableHead>
                <TableHead>{t("admin.users.columns.role")}</TableHead>
                <TableHead className="pr-4">{t("admin.users.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => {
                const isSelf = row.id === viewer?.id;
                const telegramOnly = row.email.endsWith("@telegram.local");
                return (
                  <TableRow key={row.id} className={cn(row.isBanned && "bg-destructive/[0.04]")}>
                    <TableCell className="py-3 pl-4">
                      <div className="flex min-w-[14rem] items-center gap-3">
                        <UserAvatar
                          name={row.displayName}
                          url={row.avatarUrl}
                          className={cn(row.isBanned && "opacity-50 grayscale")}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{row.displayName}</span>
                            {isSelf && (
                              <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                                {t("admin.users.you")}
                              </Badge>
                            )}
                            {row.hasTelegram && (
                              <SendIcon aria-label="Telegram" className="size-3.5 shrink-0 text-sky-500" />
                            )}
                          </div>
                          <div className="max-w-[16rem] truncate text-xs text-muted-foreground">
                            {telegramOnly ? t("admin.users.telegramAccount") : row.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        <StatChip
                          icon={<MessageSquareIcon />}
                          value={row.commentCount}
                          label={t("admin.users.comments")}
                        />
                        <StatChip icon={<StarIcon />} value={row.reviewCount} label={t("admin.users.reviews")} />
                        <StatChip
                          icon={<BookmarkIcon />}
                          value={row.libraryCount}
                          label={t("admin.users.library")}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger className="whitespace-nowrap text-sm text-muted-foreground">
                          {timeAgo(row.createdAt, locale)}
                        </TooltipTrigger>
                        <TooltipContent>{fullDate.format(new Date(row.createdAt))}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.role}
                        disabled={isSelf || setUser.isPending}
                        onValueChange={(next) => {
                          const nextRole = next as Role;
                          if (nextRole !== row.role) {
                            update(row, { role: nextRole }, { role: row.role }, t("admin.users.roleChanged"));
                          }
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-[10.5rem] rounded-lg text-xs",
                            row.role === "ADMIN" && "border-primary/40 bg-primary/10 text-primary",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER">
                            <UserIcon className="size-3.5" />
                            {t("admin.users.roleUser")}
                          </SelectItem>
                          <SelectItem value="ADMIN">
                            <ShieldCheckIcon className="size-3.5" />
                            {t("admin.users.roleAdmin")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="pr-4">
                      <Select
                        value={row.isBanned ? "banned" : "active"}
                        disabled={isSelf || setUser.isPending}
                        onValueChange={(next) => {
                          const banned = next === "banned";
                          if (banned !== row.isBanned) {
                            update(
                              row,
                              { isBanned: banned },
                              { isBanned: row.isBanned },
                              banned ? t("admin.users.bannedToast") : t("admin.users.unbannedToast"),
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 w-[10.5rem] rounded-lg text-xs",
                            row.isBanned
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">
                            <CircleCheckIcon className="size-3.5" />
                            {t("admin.users.statusActive")}
                          </SelectItem>
                          <SelectItem value="banned">
                            <BanIcon className="size-3.5" />
                            {t("admin.users.statusBanned")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePager meta={data.meta} count={data.items.length} onPage={setPage} />
        </>
      )}
    </TableShell>
  );
}
