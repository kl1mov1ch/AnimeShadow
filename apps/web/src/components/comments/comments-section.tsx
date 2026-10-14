import type { Comment, CommentMode, CommentQuery } from "@animeshadow/shared";
import {
  ClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlagIcon,
  MessageSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
  QuoteIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AchievementBadge } from "@/components/achievement-badge";
import { UserTitleBadge } from "@/components/user-title-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  type ProfileModalTarget,
  UserProfileModal,
  useProfilePrefetch,
} from "@/components/user-profile-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportCommentDialog } from "./report-comment";
import { plural } from "@/components/profile/page/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useEditComment,
  useVoteComment,
} from "@/lib/query";
import { ProMark } from "@/components/common/pro-mark";
import { cn } from "@/lib/utils";
import { clockLabel, jumpTo, usePlayerClock } from "@/lib/player-clock";

const MODES: CommentMode[] = ["PUBLIC", "ANON", "SUPPORTER"];

/** Shared shape for every action under a comment — a real pill with a real
 * tap target, rather than the bare icon-and-text runs these used to be. */
const COMMENT_ACTION_CLASS =
  "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-all duration-200 hover:bg-secondary/60 hover:text-foreground";

/** A cast vote, or the reply/quote composer currently open. */
const COMMENT_ACTION_ACTIVE = "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary";

/**
 * A quoted reply is stored as two leading blockquote lines — the quoted
 * author's name, then their snippet — followed by a blank line and the
 * actual reply. No schema change needed (comments are still one `body`
 * string end to end); this is just a convention the composer writes and
 * the renderer below reads back out, so a stored comment round-trips into
 * the same Telegram-style "replying to" strip it was composed with.
 */
const QUOTE_PATTERN = /^> (.*)\n> ([\s\S]*?)\n\n([\s\S]*)$/;

function parseQuote(body: string): { author: string; snippet: string; text: string } | null {
  const match = QUOTE_PATTERN.exec(body);
  if (!match) return null;
  const [, author, snippet, text] = match;
  return { author: author!, snippet: snippet!, text: text! };
}

function buildQuotedBody(author: string, snippet: string, text: string): string {
  // One line, no embedded newlines — the pattern above depends on the
  // snippet being exactly one `> `-prefixed line.
  const flatSnippet = snippet.replace(/\s+/g, " ").trim();
  return `> ${author}\n> ${flatSnippet}\n\n${text}`;
}

/** The Telegram-style "replying to" strip — a coloured rail, the quoted
 * author, and their snippet, sitting above the message it introduces
 * rather than pasted into it as plain text. */
function QuotePreview({
  author,
  snippet,
  className,
}: {
  author: string;
  snippet: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border-l-2 border-primary/60 bg-primary/[0.06] py-1 pl-2 pr-2.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-primary">{author}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{snippet}</p>
      </div>
    </div>
  );
}

export function CommentsSection({ animeId }: { animeId: number }) {
  const t = useT();
  const { status } = useAuth();
  const { locale } = useLocale();
  const authed = status === "authenticated";

  const [query, setQuery] = useState<CommentQuery>({ sort: "new" });
  const { data, isPending } = useComments(animeId, query);
  const [profileTarget, setProfileTarget] = useState<ProfileModalTarget | null>(null);

  return (
    <section className="flex flex-col gap-4">
      {/* As on YouTube: how many, then how they're sorted, then the box to write in.
          The panel around this already carries the "Комментарии" title. */}

      {/* Nothing to sort or filter yet — skip the toolbar rather than show
          controls over an empty list. Keep it, though, if a filter is the
          *reason* the list looks empty — otherwise there'd be no way back. */}
      {(isPending ||
        (data?.count ?? 0) > 0 ||
        query.onlyDonor ||
        query.onlyAnon ||
        query.sort !== "new") && (
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="mr-1 text-sm font-semibold tabular-nums">{locale === "ru"
                ? `${data.count} ${plural(data.count, "комментарий", "комментария", "комментариев")}`
                : t("comments.count", { count: data.count })}</span>
          )}
          <Select
            value={query.sort}
            onValueChange={(v) =>
              setQuery((q) => ({ ...q, sort: v as CommentQuery["sort"] }))
            }
          >
            <SelectTrigger className="h-8 w-auto gap-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">{t("comments.sort.newest")}</SelectItem>
              <SelectItem value="old">{t("comments.sort.oldest")}</SelectItem>
              <SelectItem value="top">{t("comments.sort.best")}</SelectItem>
            </SelectContent>
          </Select>
          <FilterToggle
            label={t("comments.filter.donators")}
            active={Boolean(query.onlyDonor)}
            onClick={() =>
              setQuery((q) => ({ ...q, onlyDonor: q.onlyDonor ? undefined : true }))
            }
          />
          <FilterToggle
            label={t("comments.filter.anon")}
            active={Boolean(query.onlyAnon)}
            onClick={() =>
              setQuery((q) => ({ ...q, onlyAnon: q.onlyAnon ? undefined : true }))
            }
          />
        </div>
      )}

      {authed ? (
        <Composer animeId={animeId} />
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground transition-colors duration-300 hover:border-primary/25">
          <Link to="/login" className="text-primary hover:underline">
            {t("comments.signInToComment")}
          </Link>
        </p>
      )}

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !data || data.comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("comments.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.comments.map((c) => (
            <li key={c.id}>
              <CommentItem
                animeId={animeId}
                comment={c}
                depth={0}
                onOpenProfile={setProfileTarget}
              />
            </li>
          ))}
        </ul>
      )}

      <UserProfileModal
        target={profileTarget}
        onOpenChange={(open) => !open && setProfileTarget(null)}
      />
    </section>
  );
}

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs transition-all duration-200",
        active
          ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm"
          : "border-border/60 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function Composer({
  animeId,
  parentId,
  quote,
  onDone,
}: {
  animeId: number;
  parentId?: string;
  /** Present only for "Quote" (not plain "Reply") — see CommentItem. */
  quote?: { author: string; snippet: string };
  onDone?: () => void;
}) {
  const t = useT();
  const create = useCreateComment(animeId);
  const [mode, setMode] = useState<CommentMode>("PUBLIC");
  const [body, setBody] = useState("");
  // A local yes/no, not just "is `quote` still truthy" — the × button lets
  // the user drop the quote and keep typing a plain reply instead of
  // closing the whole composer over it.
  const [quoting, setQuoting] = useState(quote != null);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Tie to the moment the player is at (top comments only).
  const clock = usePlayerClock(animeId);
  const [atMoment, setAtMoment] = useState(false);
  const [moment, setMoment] = useState<{ episode: number; time: number } | null>(null);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const finalBody =
      quoting && quote ? buildQuotedBody(quote.author, quote.snippet, text) : text;
    create.mutate(
      {
        animeId,
        body: finalBody,
        mode,
        parentId: parentId ?? null,
        ...(atMoment && moment && !parentId ? { episode: moment.episode, atSeconds: Math.floor(moment.time) } : {}),
      },
      {
        onSuccess: () => {
          setBody("");
          setAtMoment(false);
          onDone?.();
        },
        onError: () => toast.error(t("errors.genericTitle")),
      },
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors duration-300 focus-within:border-primary/30">
      {quoting && quote && (
        <div className="relative">
          <QuotePreview author={quote.author} snippet={quote.snippet} className="pr-7" />
          <button
            type="button"
            onClick={() => setQuoting(false)}
            aria-label={t("common.cancel")}
            className="absolute right-1.5 top-1.5 rounded-lg p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
      <Textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("comments.placeholder")}
        rows={parentId ? 2 : 3}
        className="resize-y bg-transparent"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {!parentId && clock && (
            <button
              type="button"
              onClick={() => {
                setMoment(clock);
                setAtMoment((v) => !v);
              }}
              aria-pressed={atMoment}
              title="Привязать комментарий к моменту в плеере — он появится на дорожке"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors",
                atMoment ? "bg-sky-500/20 font-semibold text-sky-600 dark:text-sky-300" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <ClockIcon className="size-3.5" />
              {atMoment && moment ? `Серия ${moment.episode} · ${clockLabel(moment.time)}` : `К моменту ${clockLabel(clock.time)}`}
            </button>
          )}
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              title={t(`comments.mode.${modeHintKey(m)}`)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs transition-all duration-200",
                mode === m
                  ? "bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:-translate-y-0.5 hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {t(`comments.mode.${modeKey(m)}`)}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={create.isPending || !body.trim()}
          className="rounded-lg bg-gradient-to-r from-primary via-primary/85 to-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:hover:translate-y-0"
        >
          {t("comments.submit")}
        </Button>
      </div>
    </div>
  );
}

function CommentItem({
  animeId,
  comment,
  depth,
  threadId,
  onOpenProfile,
}: {
  animeId: number;
  comment: Comment;
  depth: number;
  /** The top-level comment a reply belongs to: replying to a reply joins that thread. */
  threadId?: string;
  /** Undefined for a deleted/anon author — there's no one to open a profile for. */
  onOpenProfile: (author: ProfileModalTarget) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const vote = useVoteComment(animeId);
  const prefetch = useProfilePrefetch();
  const authorTarget: ProfileModalTarget | null =
    comment.author.kind === "user" && comment.author.id
      ? {
          id: comment.author.id,
          username: comment.author.username,
          preview: { displayName: comment.author.displayName, avatarUrl: comment.author.avatarUrl },
        }
      : null;
  const edit = useEditComment(animeId);
  const del = useDeleteComment(animeId);

  // Two distinct actions, not one: "Reply" opens a plain composer, "Quote"
  // opens the same composer with the quoted snippet attached — they used to
  // both funnel into one `replying` flag and one Composer that auto-quoted
  // regardless of which button was pressed, so "Reply" silently quoted too.
  const [replyMode, setReplyMode] = useState<"reply" | "quote" | null>(null);
  const [editing, setEditing] = useState(false);
  const quoted = parseQuote(comment.body);
  const [draft, setDraft] = useState(quoted?.text ?? comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // YouTube-like: a thread's replies wait behind "N ответов" until asked for.
  const [showReplies, setShowReplies] = useState(false);
  const [reporting, setReporting] = useState(false);

  const displayBody = quoted?.text ?? comment.body;
  // Long walls of text stay clamped so a thread is skimmable.
  const isLong = displayBody.length > 320 || displayBody.split("\n").length > 5;

  const isMine =
    comment.author.kind === "user" &&
    user != null &&
    (comment.author.id ? comment.author.id === user.id : comment.author.displayName === user.displayName);
  const canReport = !isMine && comment.author.kind !== "deleted";
  const small = depth > 0;
  const when = new Date(comment.createdAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const setVote = (v: -1 | 1) =>
    vote.mutate({ id: comment.id, value: comment.myVote === v ? 0 : v });

  return (
    <div className={cn("group/comment flex", small ? "gap-2.5" : "gap-3")}>
      {comment.author.kind === "user" && comment.author.id ? (
        <button
          type="button"
          {...prefetch(authorTarget!)}
          onClick={() => onOpenProfile(authorTarget!)}
          aria-label={t("comments.viewProfile")}
          className="shrink-0 self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className={cn("ring-2 ring-border/60 transition-all duration-200 hover:ring-primary/40", small ? "size-6" : "size-9")}>
            {comment.author.avatarUrl && (
              <AvatarImage src={imageSrc(comment.author.avatarUrl)} alt="" />
            )}
            <AvatarFallback className="text-xs">
              {comment.author.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      ) : (
        <Avatar className={cn("shrink-0 self-start", small ? "size-6" : "size-9")}>
          {comment.author.avatarUrl && (
            <AvatarImage src={imageSrc(comment.author.avatarUrl)} alt="" />
          )}
          <AvatarFallback className="text-xs">
            {comment.author.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {comment.author.kind === "user" && comment.author.id ? (
            <button
              type="button"
              {...prefetch(authorTarget!)}
          onClick={() => onOpenProfile(authorTarget!)}
              className="font-medium hover:text-primary"
            >
              {comment.author.displayName}
            </button>
          ) : (
            <span
              className={cn(
                "font-medium",
                comment.author.kind === "deleted" && "text-muted-foreground",
              )}
            >
              {comment.author.displayName}
            </span>
          )}
          {comment.author.isPro && <ProMark className="text-sm" />}
          <UserTitleBadge
            prefix={comment.author.titlePrefix}
            icon={comment.author.titleIcon}
            compact
          />
          {/* Every pinned achievement, not just the first — a viewer who
              pinned three shouldn't have two of them invisible to everyone
              reading their comments. Icon-only: the full title (and the
              rest of what's pinned) is a hover away, or a click on the
              avatar/name away in the full profile. */}
          {comment.author.showcaseAchievementIds.map((id) => (
            <AchievementBadge key={id} id={id} compact />
          ))}
          <span className="text-muted-foreground">{when}</span>
          {comment.editedAt && (
            <span className="text-muted-foreground/70">· {t("comments.edited")}</span>
          )}
        </div>
          {/* Edit, delete and report live behind "⋮", as on YouTube — the row
              under the text keeps only what's used all the time. */}
          {(isMine || canReport) && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Ещё"
                className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-100 transition-opacity hover:bg-secondary/60 hover:text-foreground data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover/comment:opacity-100 sm:focus-visible:opacity-100"
              >
                <MoreVerticalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {isMine ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDraft(quoted?.text ?? comment.body);
                        setEditing(true);
                      }}
                    >
                      <PencilIcon className="size-4" /> {t("comments.actions.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                      <Trash2Icon className="size-4" /> {t("comments.actions.delete")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      if (status !== "authenticated") {
                        navigate("/login", { state: { from: window.location.pathname } });
                        return;
                      }
                      setReporting(true);
                    }}
                  >
                    <FlagIcon className="size-4" /> Пожаловаться
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {comment.episode != null && comment.atSeconds != null && (
          <button
            type="button"
            onClick={() => jumpTo(comment.episode!, comment.atSeconds!)}
            title="Перейти к этому моменту"
            className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-600 transition-colors hover:bg-sky-500/25 dark:text-sky-300"
          >
            <ClockIcon className="size-3" />
            Серия {comment.episode} · {clockLabel(comment.atSeconds)}
          </button>
        )}

        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="resize-y bg-transparent"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const text = draft.trim();
                  // Editing only ever touches the reply text itself — the
                  // "replying to" reference above it (if any) survives the
                  // edit unchanged.
                  const body = quoted
                    ? buildQuotedBody(quoted.author, quoted.snippet, text)
                    : text;
                  edit.mutate(
                    { id: comment.id, body },
                    { onSuccess: () => setEditing(false) },
                  );
                }}
                disabled={edit.isPending || !draft.trim()}
                className="rounded-lg bg-gradient-to-r from-primary via-primary/85 to-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:hover:translate-y-0"
              >
                {t("common.save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                className="rounded-lg"
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {quoted && <QuotePreview author={quoted.author} snippet={quoted.snippet} />}
            <p
              className={cn(
                "whitespace-pre-line text-sm text-foreground/90",
                !expanded && isLong && "line-clamp-4",
              )}
            >
              {displayBody}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg px-2 py-0.5 text-xs font-medium text-primary/80 transition-all duration-200 hover:bg-primary/10 hover:text-primary"
              >
                {expanded ? t("common.showLess") : t("common.showMore")}
              </button>
            )}
          </div>
        )}

        {/* These were bare text-plus-icon runs: no shape, no hit area, and
            nothing but a colour change on hover. At this type size that
            left a tap target a few pixels tall on a phone. Each action is
            a real pill now, and a cast vote is a filled one rather than
            just tinted text. */}
        <div className="-ml-2 flex flex-wrap items-center gap-x-0.5 gap-y-1 text-xs text-muted-foreground">
          <button
            type="button"
            aria-label={t("comments.likeAria")}
            aria-pressed={comment.myVote === 1}
            onClick={() => setVote(1)}
            className={cn(COMMENT_ACTION_CLASS, comment.myVote === 1 && COMMENT_ACTION_ACTIVE)}
          >
            <ThumbsUpIcon className="size-3.5" /> {comment.likeCount || ""}
          </button>
          <button
            type="button"
            aria-label={t("comments.dislikeAria")}
            aria-pressed={comment.myVote === -1}
            onClick={() => setVote(-1)}
            className={cn(COMMENT_ACTION_CLASS, comment.myVote === -1 && COMMENT_ACTION_ACTIVE)}
          >
            <ThumbsDownIcon className="size-3.5" /> {comment.dislikeCount || ""}
          </button>
          <button
            type="button"
            onClick={() => setReplyMode((m) => (m === "reply" ? null : "reply"))}
            className={cn(COMMENT_ACTION_CLASS, replyMode === "reply" && COMMENT_ACTION_ACTIVE)}
          >
            <MessageSquareIcon className="size-3.5" /> {t("comments.actions.reply")}
          </button>
          <button
            type="button"
            onClick={() => setReplyMode((m) => (m === "quote" ? null : "quote"))}
            aria-label={t("comments.actions.quote")}
            className={cn(COMMENT_ACTION_CLASS, replyMode === "quote" && COMMENT_ACTION_ACTIVE)}
          >
            <QuoteIcon className="size-3.5" /> <span className="hidden sm:inline">{t("comments.actions.quote")}</span>
          </button>
        </div>
        {reporting && (
          <ReportCommentDialog commentId={comment.id} author={comment.author.displayName} onClose={() => setReporting(false)} />
        )}

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("comments.confirmDeleteTitle")}
          description={t("comments.confirmDeleteBody")}
          pending={del.isPending}
          onConfirm={() =>
            del.mutate(comment.id, {
              onSuccess: () => toast.success(t("comments.deleted")),
            })
          }
        />

        {replyMode && (
          <div className="mt-1">
            <Composer
              animeId={animeId}
              parentId={threadId ?? comment.id}
              quote={
                replyMode === "quote"
                  ? { author: comment.author.displayName, snippet: displayBody.slice(0, 200) }
                  : undefined
              }
              onDone={() => {
                setReplyMode(null);
                setShowReplies(true);
              }}
            />
          </div>
        )}

        {comment.replies.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              aria-expanded={showReplies}
              className="-ml-2 inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              {showReplies ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              {!showReplies && <ReplyFaces replies={comment.replies} />}
              {showReplies
                ? "Скрыть ответы"
                : `${comment.replies.length} ${plural(comment.replies.length, "ответ", "ответа", "ответов")}`}
            </button>
            {showReplies && (
              <ul className="flex flex-col gap-3.5">
                {comment.replies.map((r) => (
                  <li key={r.id}>
                    <CommentItem
                      animeId={animeId}
                      comment={r}
                      depth={depth + 1}
                      threadId={comment.id}
                      onOpenProfile={onOpenProfile}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Up to three faces of who replied, in front of "N ответов". */
function ReplyFaces({ replies }: { replies: Comment[] }) {
  const faces = replies.slice(0, 3);
  return (
    <span className="flex -space-x-1.5">
      {faces.map((r) => (
        <Avatar key={r.id} className="size-5 ring-2 ring-background">
          {r.author.avatarUrl && <AvatarImage src={imageSrc(r.author.avatarUrl)} alt="" />}
          <AvatarFallback className="text-[9px]">{r.author.displayName.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      ))}
    </span>
  );
}

function modeKey(m: CommentMode): "public" | "anon" | "donators" {
  return m === "PUBLIC" ? "public" : m === "ANON" ? "anon" : "donators";
}
function modeHintKey(m: CommentMode): "publicHint" | "anonHint" | "donatorsHint" {
  return m === "PUBLIC" ? "publicHint" : m === "ANON" ? "anonHint" : "donatorsHint";
}
