import type { AdminUpdateUserInput, AdminUserDetail } from "@animeshadow/shared";
import {
  ActivityIcon,
  BanIcon,
  BookmarkIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  KeyRoundIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlayIcon,
  SendIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
  Trash2Icon,
  TrophyIcon,
  WandSparklesIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import {
  useAdminDeleteComment,
  useAdminSetPassword,
  useAdminSetUser,
  useAdminUser,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { errorMessage, isOnline, timeAgo, useFormatDuration, UserAvatar } from "./admin-ui";

const STATUS_DOT: Record<string, string> = {
  WATCHING: "bg-emerald-500",
  PLANNED: "bg-sky-500",
  COMPLETED: "bg-primary",
  ON_HOLD: "bg-amber-500",
  DROPPED: "bg-rose-500",
};

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    /* clipboard blocked — nothing useful to say */
  }
}

/**
 * One user, everything the site knows about them, and every action on the
 * account — in a panel beside the list, so the list stays in view.
 */
export function AdminUserSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const t = useT();
  const { data, isPending, isError } = useAdminUser(userId);

  return (
    <Sheet open={userId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetTitle className="sr-only">{data?.user.displayName ?? t("admin.users.open")}</SheetTitle>
        <SheetDescription className="sr-only">{t("admin.users.hint")}</SheetDescription>
        {isPending ? (
          <SheetSkeleton />
        ) : isError || !data ? (
          <p className="p-6 text-sm text-muted-foreground">{t("admin.user.loadError")}</p>
        ) : (
          <UserView detail={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="flex flex-col gap-3 px-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-full" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

function UserView({ detail }: { detail: AdminUserDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const { user: viewer } = useAuth();
  const formatDuration = useFormatDuration();
  const setUser = useAdminSetUser();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const u = detail.user;
  const isSelf = u.id === viewer?.id;
  const online = isOnline(u.lastSeenAt);
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const update = (input: AdminUpdateUserInput, undo: AdminUpdateUserInput, message: string) =>
    setUser.mutate(
      { id: u.id, input },
      {
        onSuccess: () =>
          toast.success(message, {
            description: u.displayName,
            action: { label: t("admin.undo"), onClick: () => setUser.mutate({ id: u.id, input: undo }) },
          }),
        onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
      },
    );

  return (
    <>
      {/* Header: their background, avatar over its edge, name and badges. */}
      <div className="relative h-32 shrink-0 bg-gradient-to-br from-primary/25 via-secondary/40 to-background">
        {u.bannerUrl && <img src={imageSrc(u.bannerUrl)} alt="" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      </div>
      <div className="relative -mt-12 flex flex-col gap-4 px-5 pb-6">
        <div className="flex items-end gap-4">
          <span className="relative shrink-0">
            <UserAvatar name={u.displayName} url={u.avatarUrl} className="size-20 ring-4 ring-background" />
            {online && <span className="absolute bottom-1 right-1 size-4 rounded-full bg-emerald-500 ring-[3px] ring-background" />}
          </span>
          <div className="min-w-0 pb-1">
            <h2 className="truncate font-display text-xl">{u.displayName}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {u.username ? `@${u.username} · ` : ""}
              {online
                ? t("admin.users.online")
                : u.lastSeenAt
                  ? `${t("admin.user.facts.lastSeen")} ${timeAgo(u.lastSeenAt, locale)}`
                  : t("admin.users.never")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {u.role === "ADMIN" && (
            <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
              <ShieldCheckIcon className="size-3" />
              {t("admin.users.roleAdmin")}
            </Badge>
          )}
          {u.isBanned ? (
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
          {u.isPro && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <SparklesIcon className="size-3" />
              PRO
            </Badge>
          )}
          {u.hasTelegram && (
            <Badge variant="outline" className="gap-1 border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <SendIcon className="size-3" />
              Telegram
            </Badge>
          )}
        </div>

        {/* Actions — the only place in the panel that changes anything. */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setPasswordOpen(true)} className="rounded-full">
            <KeyRoundIcon />
            {t("admin.user.setPassword")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isSelf || setUser.isPending}
            onClick={() =>
              update(
                { role: u.role === "ADMIN" ? "USER" : "ADMIN" },
                { role: u.role },
                t("admin.users.roleChanged"),
              )
            }
          >
            {u.role === "ADMIN" ? <ShieldOffIcon /> : <ShieldCheckIcon />}
            {u.role === "ADMIN" ? t("admin.user.removeAdmin") : t("admin.user.makeAdmin")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn("rounded-full", !u.isBanned && "text-destructive hover:text-destructive")}
            disabled={isSelf || setUser.isPending}
            onClick={() =>
              update(
                { isBanned: !u.isBanned },
                { isBanned: u.isBanned },
                u.isBanned ? t("admin.users.unbannedToast") : t("admin.users.bannedToast"),
              )
            }
          >
            {u.isBanned ? <CircleCheckIcon /> : <BanIcon />}
            {u.isBanned ? t("admin.user.unban") : t("admin.user.ban")}
          </Button>
          {u.username && (
            <Button asChild size="sm" variant="ghost" className="rounded-full">
              <Link to={`/profile/@${u.username}`} target="_blank">
                <ExternalLinkIcon />
                {t("admin.user.openProfile")}
              </Link>
            </Button>
          )}
        </div>
        {isSelf && <p className="-mt-2 text-xs text-muted-foreground">{t("admin.user.selfNote")}</p>}

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="overview">{t("admin.user.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="library">{t("admin.user.tabs.library")}</TabsTrigger>
            <TabsTrigger value="comments">{t("admin.user.tabs.comments")}</TabsTrigger>
            <TabsTrigger value="activity">{t("admin.user.tabs.activity")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat icon={<ClockIcon />} value={formatDuration(detail.watch.seconds)} label={t("admin.user.stats.watch")} />
              <Stat icon={<PlayIcon />} value={detail.watch.sessions} label={t("admin.user.stats.sessions")} />
              <Stat icon={<EyeIcon />} value={detail.activity.pageviews30d} label={t("admin.user.stats.pageviews30")} />
              <Stat icon={<ActivityIcon />} value={`${detail.activity.activeDays30d}/30`} label={t("admin.user.stats.activeDays")} />
              <Stat icon={<BookmarkIcon />} value={u.libraryCount} label={t("admin.user.stats.library")} />
              <Stat icon={<MessageSquareIcon />} value={u.commentCount} label={t("admin.user.stats.comments")} />
              <Stat icon={<HeartIcon />} value={detail.comments.likesReceived} label={t("admin.user.stats.likes")} />
              <Stat icon={<TrophyIcon />} value={u.achievements} label={t("admin.user.stats.achievements")} />
            </div>

            <ActivityChart daily={detail.activity.daily} />

            <Section title={t("admin.user.account")}>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <Fact label={t("admin.user.facts.loginEmail")}>
                  <button
                    type="button"
                    onClick={() => void copy(u.loginEmail, t("admin.user.copied"))}
                    className="group inline-flex min-w-0 items-center gap-1.5 text-left hover:text-primary"
                    title={t("admin.user.copyEmail")}
                  >
                    <span className="truncate">{u.loginEmail}</span>
                    <CopyIcon className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  </button>
                </Fact>
                <Fact label="ID">
                  <button
                    type="button"
                    onClick={() => void copy(u.id, t("admin.user.copied"))}
                    className="group inline-flex min-w-0 items-center gap-1.5 font-mono text-xs hover:text-primary"
                    title={t("admin.user.copyId")}
                  >
                    <span className="truncate">{u.id}</span>
                    <CopyIcon className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  </button>
                </Fact>
                <Fact label={t("admin.user.facts.registered")}>{fullDate.format(new Date(u.createdAt))}</Fact>
                <Fact label={t("admin.user.facts.lastSeen")}>
                  {u.lastSeenAt ? fullDate.format(new Date(u.lastSeenAt)) : t("admin.users.never")}
                </Fact>
                <Fact label={t("admin.user.facts.emailVerified")}>{u.emailVerified ? t("admin.user.yes") : t("admin.user.no")}</Fact>
                <Fact label={t("admin.user.facts.ageVerified")}>{u.ageVerified ? t("admin.user.yes") : t("admin.user.no")}</Fact>
                <Fact label={t("admin.user.facts.pro")}>
                  {u.proSince ? fullDate.format(new Date(u.proSince)) : t("admin.user.no")}
                </Fact>
                <Fact label={t("admin.user.facts.referrer")}>{referrerHost(u.referrer) ?? t("admin.user.direct")}</Fact>
                <Fact label={t("admin.user.facts.status")}>{u.onlineStatus}</Fact>
                {u.bio && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t("admin.user.facts.bio")}</dt>
                    <dd className="mt-0.5 whitespace-pre-line">{u.bio}</dd>
                  </div>
                )}
              </dl>
            </Section>

            <Section title={t("admin.user.topWatched")}>
              {detail.watch.topAnime.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.user.noWatch")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.watch.topAnime.map((a) => {
                    const share = detail.watch.topAnime[0]!.seconds || 1;
                    return (
                      <li key={a.animeId} className="flex items-center gap-3">
                        <Thumb url={a.imageUrl} />
                        <div className="min-w-0 flex-1">
                          <Link to={animeHref({ id: a.animeId, slug: a.slug })} className="block truncate text-sm hover:text-primary">
                            {a.title}
                          </Link>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(a.seconds / share) * 100}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(a.seconds)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="library" className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
              {detail.library.byStatus.map((s) => (
                <span key={s.status} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs">
                  <span className={cn("size-2 rounded-full", STATUS_DOT[s.status])} />
                  {t(`status.${s.status}`)}
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </span>
              ))}
            </div>
            <Section title={t("admin.user.recentLibrary")}>
              {detail.library.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.user.noLibrary")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/50">
                  {detail.library.recent.map((e) => (
                    <li key={e.animeId} className="flex items-center gap-3 py-2">
                      <Thumb url={e.imageUrl} />
                      <div className="min-w-0 flex-1">
                        <Link to={animeHref({ id: e.animeId, slug: e.slug })} className="block truncate text-sm hover:text-primary">
                          {e.title}
                        </Link>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", STATUS_DOT[e.status])} />
                          {t(`status.${e.status}`)} · {e.progress}/{e.episodes ?? "?"}
                          {e.score != null && ` · ★ ${e.score}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.updatedAt, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="comments">
            <CommentsList detail={detail} />
          </TabsContent>

          <TabsContent value="activity">
            <Section title={t("admin.user.recentPages")}>
              {detail.activity.recentPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.user.noPages")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border/50">
                  {detail.activity.recentPages.map((p, i) => (
                    <li key={`${p.path}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <Link to={p.path} className="min-w-0 truncate font-mono text-xs hover:text-primary">
                        {p.path}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(p.createdAt, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </TabsContent>
        </Tabs>
      </div>

      <PasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        userId={u.id}
        name={u.displayName}
        telegram={u.loginEmail.endsWith("@telegram.local")}
      />
    </>
  );
}

function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return referrer;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-4">
      <h3 className="font-display text-sm">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card/50 p-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground [&_svg]:size-3.5 [&_svg]:text-primary">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 truncate">{children}</dd>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="h-11 w-8 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
      {url && <img src={imageSrc(url)} alt="" loading="lazy" className="size-full object-cover" />}
    </span>
  );
}

/** Pages opened and minutes watched per day — two bars a day, one axis each. */
function ActivityChart({ daily }: { daily: AdminUserDetail["activity"]["daily"] }) {
  const t = useT();
  const { locale } = useLocale();
  const maxViews = Math.max(1, ...daily.map((d) => d.pageviews));
  const maxWatch = Math.max(1, ...daily.map((d) => d.watchMinutes));
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <Section title={t("admin.user.activityChart")}>
      <div className="flex h-24 items-end gap-[3px]">
        {daily.map((d) => (
          <Tooltip key={d.date}>
            <TooltipTrigger asChild>
              <div className="flex h-full min-w-0 flex-1 items-end gap-px">
                <span
                  className="w-1/2 rounded-t-sm bg-primary/70 transition-colors hover:bg-primary"
                  style={{ height: `${Math.max(d.pageviews ? 6 : 2, (d.pageviews / maxViews) * 100)}%` }}
                />
                <span
                  className="w-1/2 rounded-t-sm bg-sky-500/70 transition-colors hover:bg-sky-500"
                  style={{ height: `${Math.max(d.watchMinutes ? 6 : 2, (d.watchMinutes / maxWatch) * 100)}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {day.format(new Date(d.date))}: {d.pageviews} {t("admin.user.pagesLegend")} · {d.watchMinutes}{" "}
              {t("admin.user.watchLegend")}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary/70" />
          {t("admin.user.pagesLegend")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-sky-500/70" />
          {t("admin.user.watchLegend")}
        </span>
      </div>
    </Section>
  );
}

function CommentsList({ detail }: { detail: AdminUserDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const remove = useAdminDeleteComment();
  const c = detail.comments;
  return (
    <Section title={`${t("admin.user.tabs.comments")} · ${c.total}${c.deleted ? ` (${c.deleted} ${t("admin.user.deletedComment")})` : ""}`}>
      {c.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.user.noComments")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {c.recent.map((comment) => (
            <li key={comment.id} className={cn("flex gap-3 py-2.5", comment.deleted && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <Link to={`/anime/${comment.animeSlug}`} className="font-medium text-foreground hover:text-primary">
                    {comment.animeTitle}
                  </Link>
                  <span>{timeAgo(comment.createdAt, locale)}</span>
                  <span className="inline-flex items-center gap-0.5">
                    <HeartIcon className="size-3" />
                    {comment.likeCount}
                  </span>
                  {comment.deleted && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {t("admin.user.deletedComment")}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm">{comment.body}</p>
              </div>
              {!comment.deleted && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(comment.id, {
                          onSuccess: () => toast.success(t("admin.user.commentDeleted")),
                          onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
                        })
                      }
                      aria-label={t("admin.user.deleteComment")}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("admin.user.deleteComment")}</TooltipContent>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** A readable random password: no look-alike characters (0/O, 1/l/I). */
function generatePassword(length = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Sets a new password for the account. After saving it shows the login and
 * the password together, with one button to copy both — what the admin
 * needs to hand over. The password exists only in this dialog; closing it
 * forgets it.
 */
function PasswordDialog({
  open,
  onOpenChange,
  userId,
  name,
  telegram,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string;
  telegram: boolean;
}) {
  const t = useT();
  const setPassword = useAdminSetPassword();
  const [password, setPasswordValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState<{ login: string; password: string } | null>(null);
  const tooShort = password.length > 0 && password.length < 8;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setPasswordValue("");
      setVisible(false);
      setDone(null);
    }
  };

  const submit = () => {
    if (password.length < 8) return;
    setPassword.mutate(
      { id: userId, password },
      {
        onSuccess: (res) => setDone({ login: res.loginEmail, password }),
        onError: (error) => toast.error(errorMessage(error, t("errors.genericBody"))),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
                  <CheckIcon className="size-4" />
                </span>
                {t("admin.user.password.doneTitle")}
              </DialogTitle>
              <DialogDescription>{t("admin.user.password.doneBody")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 font-mono text-sm">
              <p>
                <span className="text-xs text-muted-foreground">{t("admin.user.password.loginLabel")}: </span>
                {done.login}
              </p>
              <p>
                <span className="text-xs text-muted-foreground">{t("admin.user.password.label")}: </span>
                {done.password}
              </p>
            </div>
            {telegram && <p className="text-xs text-muted-foreground">{t("admin.user.password.telegramNote")}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  void copy(
                    `${t("admin.user.password.loginLabel")}: ${done.login}\n${t("admin.user.password.label")}: ${done.password}`,
                    t("admin.user.copied"),
                  )
                }
              >
                <CopyIcon />
                {t("admin.user.password.copyBoth")}
              </Button>
              <Button onClick={() => close(false)}>{t("admin.user.password.close")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRoundIcon className="size-5 text-primary" />
                {t("admin.user.password.title")} — {name}
              </DialogTitle>
              <DialogDescription>{t("admin.user.password.body")}</DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label htmlFor="admin-new-password" className="text-sm font-medium">
                {t("admin.user.password.label")}
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    id="admin-new-password"
                    type={visible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    placeholder={t("admin.user.password.placeholder")}
                    autoComplete="new-password"
                    maxLength={128}
                    aria-invalid={tooShort}
                    className="pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? t("admin.user.password.hide") : t("admin.user.password.show")}
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPasswordValue(generatePassword());
                    setVisible(true);
                  }}
                >
                  <WandSparklesIcon />
                  {t("admin.user.password.generate")}
                </Button>
              </div>
              {tooShort && <p className="text-xs text-destructive">{t("admin.user.password.tooShort")}</p>}
              <DialogFooter className="mt-2">
                <Button type="button" variant="ghost" onClick={() => close(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={password.length < 8 || setPassword.isPending}>
                  {setPassword.isPending && <Loader2Icon className="animate-spin" />}
                  {t("admin.user.password.save")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
