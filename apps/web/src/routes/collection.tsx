import type { AnimeSummary, CollectionComment, CollectionDetail } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  BarChart3Icon,
  CalendarIcon,
  EyeIcon,
  LayersIcon,
  MessageSquareIcon,
  PencilIcon,
  QuoteIcon,
  ReplyIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CoverFlow } from "@/components/collections/cover-flow";
import { RatingBadge, TagChip } from "@/components/collections/collection-card";
import { ProMark } from "@/components/common/pro-mark";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocale, useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  recordCollectionView,
  useAddCollectionComment,
  useCollection,
  useCollectionComments,
  useDeleteCollection,
  useDeleteCollectionComment,
  useRateCollection,
} from "@/lib/query";
import { cn } from "@/lib/utils";
import { getVisitorId } from "@/lib/visitor";

/**
 * A collection, read like an article: the cover-flow of its anime on top,
 * the title, lead and author, then the body — paragraphs and anime cards
 * interleaved, each card with the author's own words on why it's there —
 * and at the end the rating and the discussion.
 */
export function Component() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError, refetch } = useCollection(id);

  // One view per visitor per day, counted by the server.
  useEffect(() => {
    if (!id) return;
    const key = `as:col-view:${id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: the server dedupes anyway */
    }
    void recordCollectionView(id, getVisitorId()).catch(() => undefined);
  }, [id]);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (isPending || !data) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 py-6">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  return <Article collection={data} />;
}

function Article({ collection: c }: { collection: CollectionDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const remove = useDeleteCollection();
  const date = new Date(c.createdAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const authorHref = c.author.username ? `/profile/${c.author.username}` : null;

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-6 py-4 sm:py-6">
      <Hero collection={c} />

      <header className="flex flex-col gap-3">
        {c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((tag) => (
              <Link key={tag} to={`/collections?tag=${tag}`}>
                <TagChip tag={tag} />
              </Link>
            ))}
          </div>
        )}
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{c.title}</h1>
        {c.summary && <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{c.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--accent-line-soft)] py-3 text-sm">
          <Link
            to={authorHref ?? "#"}
            className={cn("flex items-center gap-2 font-semibold", authorHref && "hover:text-primary")}
          >
            <span className="grid size-8 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
              {c.author.avatarUrl ? (
                <img src={imageSrc(c.author.avatarUrl)} alt="" className="size-full object-cover" />
              ) : (
                c.author.displayName.charAt(0).toUpperCase()
              )}
            </span>
            {c.author.displayName}
            {c.author.isPro && <ProMark />}
          </Link>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarIcon className="size-3.5" />
            {date}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <LayersIcon className="size-3.5" />
            {t("collections.animeCount", { n: c.animeCount })}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <EyeIcon className="size-3.5" />
            {c.viewCount}
          </span>
          <RatingBadge avg={c.ratingAvg} count={c.ratingCount} />
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MessageSquareIcon className="size-3.5" />
            {c.commentCount}
          </span>
          {c.canEdit && (
            <span className="ml-auto flex flex-wrap gap-1.5">
              <Link
                to={`/collections/${c.id}/edit`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <PencilIcon className="size-3.5" />
                {t("common.edit")}
              </Link>
              <Link
                to={`/collections/stats?open=${c.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <BarChart3Icon className="size-3.5" />
                {t("collections.stats")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(t("collections.deleteConfirm"))) return;
                  remove.mutate(c.id, { onSuccess: () => navigate("/collections", { replace: true }) });
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/35 px-3 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5">
        {c.blocks.map((block, i) =>
          block.type === "text" ? (
            <div key={i} className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90 sm:text-base">
              {block.text.split(/\n{2,}/).map((para, j) => (
                <p key={j} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          ) : c.anime[block.animeId] ? (
            <AnimeEmbed key={i} anime={c.anime[block.animeId]!} note={block.note} author={c.author.displayName} index={animeIndex(c, i)} />
          ) : null,
        )}
      </div>

      <RatePanel collection={c} />
      <Comments collectionId={c.id} />
    </article>
  );
}

/** 1-based position of the anime block at `blockIndex` among all anime. */
function animeIndex(c: CollectionDetail, blockIndex: number): number {
  return c.blocks.slice(0, blockIndex + 1).filter((b) => b.type === "anime").length;
}

function AnimeEmbed({ anime, note, author, index }: { anime: AnimeSummary; note: string; author: string; index: number }) {
  const t = useT();
  const labels = useLabels();
  const meta = [labels.typeLabel(anime.type), labels.seasonYearLabel(anime)].filter(Boolean).join(" · ");
  return (
    <section className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:flex-row sm:p-4">
      <Link to={animeHref(anime)} viewTransition className="group relative shrink-0 self-center sm:self-start">
        <span className="block aspect-[2/3] w-32 overflow-hidden rounded-xl border border-primary/30 sm:w-36">
          {anime.imageUrl && (
            <img
              src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </span>
        <span className="absolute -left-2 -top-2 grid size-8 place-items-center rounded-full bg-primary font-display text-sm text-primary-foreground shadow-lg shadow-primary/40">
          {index}
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Link to={animeHref(anime)} viewTransition className="font-display text-xl leading-tight transition-colors hover:text-primary">
          {labels.title(anime)}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {meta && <span>{meta}</span>}
          {anime.score != null && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-500">
              <StarIcon className="size-3 fill-current" />
              {anime.score.toFixed(2)}
            </span>
          )}
        </div>
        {anime.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {anime.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {labels.genreLabel(g)}
              </span>
            ))}
          </div>
        )}
        {note ? (
          <blockquote className="relative mt-1 rounded-xl border-l-2 border-primary bg-card/60 p-3 pl-9 text-sm leading-relaxed">
            <QuoteIcon className="absolute left-2.5 top-3 size-4 text-primary/70" />
            <span className="whitespace-pre-line">{note}</span>
            <span className="mt-1.5 block text-[11px] font-semibold text-muted-foreground">— {author}</span>
          </blockquote>
        ) : (
          anime.synopsis && <p className="line-clamp-3 text-sm text-muted-foreground">{anime.synopsis}</p>
        )}
        <Link
          to={animeHref(anime)}
          viewTransition
          className="mt-auto inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          {t("collections.openAnime")}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

/**
 * The top of the page: every anime in the collection as a wall of small
 * posters, tilted and dimmed, and the cover-flow standing in front of it.
 * All static — the wall is drawn once, only the cover-flow moves.
 */
function Hero({ collection: c }: { collection: CollectionDetail }) {
  const images = Object.values(c.anime)
    .map((a) => a.imageUrl)
    .filter((u): u is string => Boolean(u));
  // Enough tiles to fill the wall whatever the count.
  const tiles = images.length > 0 ? Array.from({ length: 48 }, (_, i) => images[i % images.length]!) : [];
  return (
    <div className="relative isolate overflow-hidden rounded-3xl border border-[var(--accent-line-soft)] bg-card">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -inset-[20%] grid rotate-[-10deg] grid-cols-8 gap-2 opacity-55 sm:grid-cols-12">
          {tiles.map((src, i) => (
            <span key={i} className="aspect-[2/3] overflow-hidden rounded-md bg-muted">
              <img src={imageSrc(src)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
            </span>
          ))}
        </div>
        <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--background)_20%,transparent)_0%,var(--background)_85%)]" />
        <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>
      <CoverFlow items={c.cover} backdrop={false} />
    </div>
  );
}

const RATING_WORDS = ["bad", "meh", "ok", "good", "masterpiece"] as const;

/**
 * Rating: the result on the left — the average, big, and how the votes
 * split — and the viewer's own vote on the right, with a word for each
 * star as you hover so a click means something.
 */
function RatePanel({ collection: c }: { collection: CollectionDetail }) {
  const t = useT();
  const { status } = useAuth();
  const rate = useRateCollection(c.id);
  const [hover, setHover] = useState<number | null>(null);
  const canRate = status === "authenticated" && !c.canEdit;
  const shown = hover ?? c.myRating ?? 0;
  const max = Math.max(1, ...c.ratingDist);
  const word = (v: number) => t(`collections.rate.${RATING_WORDS[v - 1]}` as "collections.rate.ok");

  return (
    <section className="grid gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.1] via-transparent to-transparent p-4 sm:grid-cols-2 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="font-display text-5xl leading-none tabular-nums">{c.ratingAvg != null ? c.ratingAvg.toFixed(1) : "—"}</span>
          <span className="mt-1 flex">
            {[1, 2, 3, 4, 5].map((v) => (
              <StarIcon
                key={v}
                className={cn("size-3.5", c.ratingAvg != null && v <= Math.round(c.ratingAvg) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
              />
            ))}
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">{t("collections.votes", { n: c.ratingCount })}</span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {[5, 4, 3, 2, 1].map((v) => (
            <div key={v} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 tabular-nums text-muted-foreground">{v}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(c.ratingDist[v - 1]! / max) * 100}%` }} />
              </span>
              <span className="w-4 text-right tabular-nums text-muted-foreground">{c.ratingDist[v - 1]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-3 text-center">
        {c.canEdit ? (
          <p className="text-sm text-muted-foreground">{t("collections.rateOwn")}</p>
        ) : status !== "authenticated" ? (
          <>
            <p className="font-semibold">{t("collections.rateTitle")}</p>
            <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
              {t("collections.signInToRate")}
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold">{c.myRating ? t("collections.yourRating") : t("collections.rateTitle")}</p>
            <div className="flex gap-1" onMouseLeave={() => setHover(null)}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={!canRate || rate.isPending}
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                  onBlur={() => setHover(null)}
                  onClick={() =>
                    rate.mutate(v, {
                      onSuccess: () => toast.success(t("collections.rated")),
                      onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : t("errors.genericTitle")),
                    })
                  }
                  aria-label={word(v)}
                  className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <StarIcon className={cn("size-8 transition-colors", v <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35")} />
                </button>
              ))}
            </div>
            <p className={cn("h-4 text-xs font-semibold", shown ? "text-amber-500" : "text-muted-foreground")}>
              {shown ? word(shown) : t("collections.rateHint")}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function timeAgo(iso: string, locale: string): string {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, sec] of steps) if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
  return rtf.format(0, "second");
}

/**
 * The discussion as threads, not one pile: a top comment, and its replies
 * indented under it, each reply saying whom it answers. The collection's
 * author and your own comments are marked. A long thread shows its last
 * three replies until opened.
 */
function Comments({ collectionId }: { collectionId: string }) {
  const t = useT();
  const { status } = useAuth();
  const { data, isPending } = useCollectionComments(collectionId);
  const [replyTo, setReplyTo] = useState<CollectionComment | null>(null);

  const all = data ?? [];
  const tops = all.filter((c) => !c.parentId).reverse(); // newest threads first
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id); // oldest first

  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <MessageSquareIcon className="size-5 text-primary" />
        {t("collections.comments")}
        <span className="text-sm text-muted-foreground">{all.length}</span>
      </h2>

      {status === "authenticated" ? (
        <Composer collectionId={collectionId} />
      ) : (
        <Link to="/login" className="rounded-xl border border-dashed border-primary/30 p-3 text-center text-sm text-primary hover:bg-primary/5">
          {t("collections.signInToComment")}
        </Link>
      )}

      {isPending ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : tops.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("collections.noComments")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tops.map((top) => (
            <Thread
              key={top.id}
              top={top}
              replies={repliesOf(top.id)}
              collectionId={collectionId}
              replyTo={replyTo}
              onReply={(c) => setReplyTo(status === "authenticated" ? c : null)}
              onCancelReply={() => setReplyTo(null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Thread({
  top,
  replies,
  collectionId,
  replyTo,
  onReply,
  onCancelReply,
}: {
  top: CollectionComment;
  replies: CollectionComment[];
  collectionId: string;
  replyTo: CollectionComment | null;
  onReply: (c: CollectionComment) => void;
  onCancelReply: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const hidden = open ? 0 : Math.max(0, replies.length - 3);
  const shown = replies.slice(hidden);
  const answeringHere = replyTo != null && (replyTo.id === top.id || replies.some((r) => r.id === replyTo.id));

  return (
    <li className="rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:p-4">
      <CommentBody comment={top} collectionId={collectionId} onReply={onReply} />
      {(replies.length > 0 || answeringHere) && (
        <div className="ml-4 mt-3 flex flex-col gap-3 border-l-2 border-primary/25 pl-3 sm:ml-10 sm:pl-4">
          {hidden > 0 && (
            <button type="button" onClick={() => setOpen(true)} className="self-start text-xs font-semibold text-primary hover:underline">
              {t("collections.moreReplies", { n: hidden })}
            </button>
          )}
          {shown.map((r) => (
            <CommentBody key={r.id} comment={r} collectionId={collectionId} onReply={onReply} reply />
          ))}
          {answeringHere && <Composer collectionId={collectionId} replyTo={replyTo} onDone={onCancelReply} />}
        </div>
      )}
    </li>
  );
}

function CommentBody({
  comment: c,
  collectionId,
  onReply,
  reply = false,
}: {
  comment: CollectionComment;
  collectionId: string;
  onReply: (c: CollectionComment) => void;
  reply?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useAuth();
  const remove = useDeleteCollectionComment(collectionId);
  const href = c.author.username ? `/profile/${c.author.username}` : null;

  return (
    <article id={`c-${c.id}`} className="flex gap-2.5">
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 font-bold text-primary",
          reply ? "size-7 text-[10px]" : "size-9 text-xs",
          c.byCollectionAuthor && "ring-2 ring-primary",
        )}
      >
        {c.author.avatarUrl ? (
          <img src={imageSrc(c.author.avatarUrl)} alt="" className="size-full object-cover" />
        ) : (
          c.author.displayName.charAt(0).toUpperCase()
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
          {href ? (
            <Link to={href} className="font-semibold hover:text-primary">
              {c.author.displayName}
            </Link>
          ) : (
            <span className="font-semibold">{c.author.displayName}</span>
          )}
          {c.author.isPro && <ProMark className="text-xs" />}
          {c.byCollectionAuthor && (
            <span className="rounded bg-primary px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
              {t("collections.byAuthor")}
            </span>
          )}
          {c.mine && !c.byCollectionAuthor && (
            <span className="rounded bg-foreground/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide">
              {t("collections.you")}
            </span>
          )}
          {c.replyTo && (
            <a href={`#c-${c.replyTo.id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
              <ReplyIcon className="size-3" />
              {c.replyTo.displayName}
            </a>
          )}
          <span className="text-muted-foreground">· {timeAgo(c.createdAt, locale)}</span>
        </div>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed">{c.body}</p>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          {status === "authenticated" && (
            <button type="button" onClick={() => onReply(c)} className="inline-flex items-center gap-1 hover:text-primary">
              <ReplyIcon className="size-3" />
              {t("collections.reply")}
            </button>
          )}
          {c.canDelete && (
            <button type="button" onClick={() => remove.mutate(c.id)} className="inline-flex items-center gap-1 hover:text-rose-500">
              <Trash2Icon className="size-3" />
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Composer({
  collectionId,
  replyTo,
  onDone,
}: {
  collectionId: string;
  replyTo?: CollectionComment | null;
  onDone?: () => void;
}) {
  const t = useT();
  const add = useAddCollectionComment(collectionId);
  const [body, setBody] = useState("");
  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate(
      { body: text, parentId: replyTo?.id },
      {
        onSuccess: () => {
          setBody("");
          onDone?.();
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : t("errors.genericTitle")),
      },
    );
  };
  return (
    <div className={cn("flex flex-col gap-2", !replyTo && "rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3")}>
      {replyTo && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ReplyIcon className="size-3 text-primary" />
          {t("collections.replyingTo", { name: replyTo.author.displayName })}
        </span>
      )}
      <textarea
        autoFocus={Boolean(replyTo)}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
        maxLength={2000}
        rows={replyTo ? 2 : 3}
        placeholder={replyTo ? t("collections.replyPlaceholder") : t("collections.commentPlaceholder")}
        className="w-full resize-y rounded-lg border border-primary/20 bg-card/60 p-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="flex items-center justify-end gap-2">
        {replyTo && (
          <button type="button" onClick={onDone} className="h-8 rounded-lg px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
            {t("common.cancel")}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={add.isPending || !body.trim()}
          className="btn-sheen inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <SendIcon className="size-3.5" />
          {replyTo ? t("collections.reply") : t("collections.send")}
        </button>
      </div>
    </div>
  );
}
