import type { Comment, CommentMode, CommentQuery } from "@animeshadow/shared";
import {
  MessageSquareIcon,
  PencilIcon,
  QuoteIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AchievementBadge } from "@/components/achievement-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import { useT } from "@/i18n";
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

export function CommentsSection({ animeId }: { animeId: number }) {
  const t = useT();
  const { status } = useAuth();
  const authed = status === "authenticated";

  const [query, setQuery] = useState<CommentQuery>({ sort: "new" });
  const { data, isPending } = useComments(animeId, query);

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
        <p className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            {t("comments.signInToComment")}
          </Link>
        </p>
      )}

      {/* toolbar */}
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

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
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
              <CommentItem animeId={animeId} comment={c} depth={0} />
            </li>
          ))}
        </ul>
      )}
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
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:text-foreground",
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
  quote?: string;
  onDone?: () => void;
}) {
  const t = useT();
  const create = useCreateComment(animeId);
  const [mode, setMode] = useState<CommentMode>("PUBLIC");
  const [body, setBody] = useState(quote ? `> ${quote}\n\n` : "");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    create.mutate(
      { animeId, body: text, mode, parentId: parentId ?? null },
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
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
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
                "rounded-md px-2 py-1 text-xs transition-colors",
                mode === m
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`comments.mode.${modeKey(m)}`)}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={submit} disabled={create.isPending || !body.trim()}>
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
}: {
  animeId: number;
  comment: Comment;
  depth: number;
}) {
  const t = useT();
  const { user } = useAuth();
  const vote = useVoteComment(animeId);
  const edit = useEditComment(animeId);
  const del = useDeleteComment(animeId);

  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Long walls of text stay clamped so a thread is skimmable.
  const isLong = comment.body.length > 320 || comment.body.split("\n").length > 5;

  const isMine =
    comment.author.kind === "user" &&
    user != null &&
    comment.author.displayName === user.displayName;
  const when = new Date(comment.createdAt).toLocaleDateString("ru", {
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
      <Avatar className="size-8 shrink-0">
        {comment.author.avatarUrl && (
          <AvatarImage src={imageSrc(comment.author.avatarUrl)} alt="" />
        )}
        <AvatarFallback className="text-xs">
          {comment.author.displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {comment.author.kind === "user" && comment.author.username ? (
            <Link
              to={`/profile/@${comment.author.username}`}
              className="font-medium hover:text-primary"
            >
              {comment.author.displayName}
            </Link>
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
            <Badge className="h-4 bg-primary/15 px-1 text-[10px] text-primary">
              PRO
            </Badge>
          )}
          <AchievementBadge id={comment.author.showcaseAchievementId} className="h-4 px-1 py-0" />
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
                onClick={() =>
                  edit.mutate(
                    { id: comment.id, body: draft.trim() },
                    { onSuccess: () => setEditing(false) },
                  )
                }
                disabled={edit.isPending || !draft.trim()}
              >
                {t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-0.5">
            <p
              className={cn(
                "whitespace-pre-line text-sm text-foreground/90",
                !expanded && isLong && "line-clamp-4",
              )}
            >
              {comment.body}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {expanded ? t("common.showLess") : t("common.showMore")}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <button
            type="button"
            aria-label={t("comments.likeAria")}
            onClick={() => setVote(1)}
            className={cn(
              "inline-flex items-center gap-1 hover:text-foreground",
              comment.myVote === 1 && "text-primary",
            )}
          >
            <ThumbsUpIcon className="size-3.5" /> {comment.likeCount || ""}
          </button>
          <button
            type="button"
            aria-label={t("comments.dislikeAria")}
            onClick={() => setVote(-1)}
            className={cn(
              "inline-flex items-center gap-1 hover:text-foreground",
              comment.myVote === -1 && "text-primary",
            )}
          >
            <ThumbsDownIcon className="size-3.5" /> {comment.dislikeCount || ""}
          </button>
          {depth === 0 && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <MessageSquareIcon className="size-3.5" /> {t("comments.actions.reply")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-1 hover:text-foreground"
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
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <PencilIcon className="size-3.5" /> {t("comments.actions.edit")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 hover:text-destructive"
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

        {replying && (
          <div className="mt-1">
            <Composer
              animeId={animeId}
              parentId={comment.id}
              quote={comment.body.length < 240 ? comment.body : undefined}
              onDone={() => setReplying(false)}
            />
          </div>
        )}

        {comment.replies.length > 0 && (
          <ul className="mt-2 flex flex-col gap-3">
            {comment.replies.map((r) => (
              <li key={r.id}>
                <CommentItem animeId={animeId} comment={r} depth={depth + 1} />
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
