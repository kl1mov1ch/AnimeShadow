import type { Comment, CommentMode, CommentQuery } from "@animeshadow/shared";
import {
  MessageSquareIcon,
  PencilIcon,
  QuoteIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AchievementBadge } from "@/components/achievement-badge";
import { UserTitleBadge } from "@/components/user-title-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  type ProfileModalTarget,
  UserProfileModal,
} from "@/components/user-profile-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

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
  const authed = status === "authenticated";

  const [query, setQuery] = useState<CommentQuery>({ sort: "new" });
  const { data, isPending } = useComments(animeId, query);
  const [profileTarget, setProfileTarget] = useState<ProfileModalTarget | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("comments.heading")}
        {data && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {t("comments.count", { count: data.count })}
          </span>
        )}
      </h2>

      {authed ? (
        <Composer animeId={animeId} />
      ) : (
        <p className="rounded-2xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground transition-colors duration-300 hover:border-primary/25">
          <Link to="/login" className="text-primary hover:underline">
            {t("comments.signInToComment")}
          </Link>
        </p>
      )}

      {/* Nothing to sort or filter yet — skip the toolbar rather than show
          controls over an empty list. Keep it, though, if a filter is the
          *reason* the list looks empty — otherwise there'd be no way back. */}
      {(isPending ||
        (data?.count ?? 0) > 0 ||
        query.onlyDonor ||
        query.onlyAnon ||
        query.sort !== "new") && (
        <div className="flex flex-wrap items-center gap-2">
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
        "rounded-full border px-2.5 py-1 text-xs transition-all duration-200",
        active
          ? "border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm shadow-primary/25"
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

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const finalBody =
      quoting && quote ? buildQuotedBody(quote.author, quote.snippet, text) : text;
    create.mutate(
      { animeId, body: finalBody, mode, parentId: parentId ?? null },
      {
        onSuccess: () => {
          setBody("");
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
            className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
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
        <div className="flex items-center gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              title={t(`comments.mode.${modeHintKey(m)}`)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-all duration-200",
                mode === m
                  ? "bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-sm shadow-primary/25"
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
          className="rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary shadow-sm shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/35 disabled:hover:translate-y-0"
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
  onOpenProfile,
}: {
  animeId: number;
  comment: Comment;
  depth: number;
  /** Undefined for a deleted/anon author — there's no one to open a profile for. */
  onOpenProfile: (author: { id: string; username: string | null }) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { user } = useAuth();
  const vote = useVoteComment(animeId);
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

  const displayBody = quoted?.text ?? comment.body;
  // Long walls of text stay clamped so a thread is skimmable.
  const isLong = displayBody.length > 320 || displayBody.split("\n").length > 5;

  const isMine =
    comment.author.kind === "user" &&
    user != null &&
    comment.author.displayName === user.displayName;
  const when = new Date(comment.createdAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const setVote = (v: -1 | 1) =>
    vote.mutate({ id: comment.id, value: comment.myVote === v ? 0 : v });

  return (
    <div
      className={cn(
        "flex gap-3",
        depth > 0 && "ml-4 border-l border-border/50 pl-3 sm:ml-6 sm:pl-4",
      )}
    >
      {comment.author.kind === "user" && comment.author.id ? (
        <button
          type="button"
          onClick={() => onOpenProfile({ id: comment.author.id!, username: comment.author.username })}
          aria-label={t("comments.viewProfile")}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8 ring-2 ring-border/60 transition-all duration-200 hover:ring-primary/40">
            {comment.author.avatarUrl && (
              <AvatarImage src={imageSrc(comment.author.avatarUrl)} alt="" />
            )}
            <AvatarFallback className="text-xs">
              {comment.author.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      ) : (
        <Avatar className="size-8 shrink-0">
          {comment.author.avatarUrl && (
            <AvatarImage src={imageSrc(comment.author.avatarUrl)} alt="" />
          )}
          <AvatarFallback className="text-xs">
            {comment.author.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {comment.author.kind === "user" && comment.author.id ? (
            <button
              type="button"
              onClick={() => onOpenProfile({ id: comment.author.id!, username: comment.author.username })}
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
          {comment.author.isPro && (
            <Badge className="h-4 border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary px-1.5 text-[10px] font-semibold tracking-wide text-primary-foreground shadow-sm shadow-primary/25">
              PRO
            </Badge>
          )}
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
                className="rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary shadow-sm shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/35 disabled:hover:translate-y-0"
              >
                {t("common.save")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                className="rounded-full"
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
                className="rounded-full px-2 py-0.5 text-xs font-medium text-primary/80 transition-all duration-200 hover:bg-primary/10 hover:text-primary"
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
          {depth === 0 && (
            <button
              type="button"
              onClick={() => setReplyMode((m) => (m === "reply" ? null : "reply"))}
              className={cn(COMMENT_ACTION_CLASS, replyMode === "reply" && COMMENT_ACTION_ACTIVE)}
            >
              <MessageSquareIcon className="size-3.5" /> {t("comments.actions.reply")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReplyMode((m) => (m === "quote" ? null : "quote"))}
            className={cn(COMMENT_ACTION_CLASS, replyMode === "quote" && COMMENT_ACTION_ACTIVE)}
          >
            <QuoteIcon className="size-3.5" /> {t("comments.actions.quote")}
          </button>
          {isMine && comment.author.kind !== "deleted" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className={COMMENT_ACTION_CLASS}
              >
                <PencilIcon className="size-3.5" /> {t("comments.actions.edit")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className={cn(
                  COMMENT_ACTION_CLASS,
                  "hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <Trash2Icon className="size-3.5" /> {t("comments.actions.delete")}
              </button>
            </>
          )}
        </div>

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
              parentId={comment.id}
              quote={
                replyMode === "quote"
                  ? { author: comment.author.displayName, snippet: displayBody.slice(0, 200) }
                  : undefined
              }
              onDone={() => setReplyMode(null)}
            />
          </div>
        )}

        {comment.replies.length > 0 && (
          <ul className="mt-2 flex flex-col gap-3">
            {comment.replies.map((r) => (
              <li key={r.id}>
                <CommentItem
                  animeId={animeId}
                  comment={r}
                  depth={depth + 1}
                  onOpenProfile={onOpenProfile}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function modeKey(m: CommentMode): "public" | "anon" | "donators" {
  return m === "PUBLIC" ? "public" : m === "ANON" ? "anon" : "donators";
}
function modeHintKey(m: CommentMode): "publicHint" | "anonHint" | "donatorsHint" {
  return m === "PUBLIC" ? "publicHint" : m === "ANON" ? "anonHint" : "donatorsHint";
}
