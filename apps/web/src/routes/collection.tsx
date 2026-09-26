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
      <div className="overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)]">
        <CoverFlow items={c.cover.length > 0 ? c.cover : []} />
      </div>

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

function RatePanel({ collection: c }: { collection: CollectionDetail }) {
  const t = useT();
  const { status } = useAuth();
  const rate = useRateCollection(c.id);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? c.myRating ?? 0;
  const canRate = status === "authenticated" && !c.canEdit;

  return (
    <section className="flex flex-col items-center gap-2 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.12] to-transparent p-5 text-center">
      <p className="font-display text-lg">{c.canEdit ? t("collections.rateOwn") : t("collections.rateTitle")}</p>
      <div className="flex gap-1" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            disabled={!canRate || rate.isPending}
            onMouseEnter={() => canRate && setHover(v)}
            onClick={() =>
              rate.mutate(v, {
                onSuccess: () => toast.success(t("collections.rated")),
                onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : t("errors.genericTitle")),
              })
            }
            aria-label={`${v}`}
            className="transition-transform enabled:hover:scale-110 disabled:cursor-default"
          >
            <StarIcon className={cn("size-8", v <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.ratingAvg != null ? t("collections.ratingLine", { avg: c.ratingAvg.toFixed(1), n: c.ratingCount }) : t("collections.noRatings")}
        {status !== "authenticated" && (
          <>
            {" · "}
            <Link to="/login" className="text-primary hover:underline">
              {t("collections.signInToRate")}
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

function Comments({ collectionId }: { collectionId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useAuth();
  const { data, isPending } = useCollectionComments(collectionId);
  const add = useAddCollectionComment(collectionId);
  const remove = useDeleteCollectionComment(collectionId);
  const [body, setBody] = useState("");

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate(text, {
      onSuccess: () => setBody(""),
      onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : t("errors.genericTitle")),
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <MessageSquareIcon className="size-5 text-primary" />
        {t("collections.comments")}
        {data && <span className="text-sm text-muted-foreground">{data.length}</span>}
      </h2>
      {status === "authenticated" ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={t("collections.commentPlaceholder")}
            className="w-full resize-y rounded-lg border border-primary/20 bg-card/60 p-2.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            disabled={add.isPending || !body.trim()}
            className="btn-sheen inline-flex h-9 items-center gap-1.5 self-end rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <SendIcon className="size-4" />
            {t("collections.send")}
          </button>
        </div>
      ) : (
        <Link to="/login" className="rounded-xl border border-dashed border-primary/30 p-3 text-center text-sm text-primary hover:bg-primary/5">
          {t("collections.signInToComment")}
        </Link>
      )}
      {isPending ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("collections.noComments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data!.map((c: CollectionComment) => (
            <li key={c.id} className="flex gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-card/40 p-3">
              <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                {c.author.avatarUrl ? (
                  <img src={imageSrc(c.author.avatarUrl)} alt="" className="size-full object-cover" />
                ) : (
                  c.author.displayName.charAt(0).toUpperCase()
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold">{c.author.displayName}</span>
                  {c.author.isPro && <ProMark className="text-xs" />}
                  <span className="text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                  </span>
                  {c.canDelete && (
                    <button
                      type="button"
                      onClick={() => remove.mutate(c.id)}
                      aria-label={t("common.delete")}
                      className="ml-auto text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  )}
                </span>
                <p className="whitespace-pre-line break-words text-sm leading-relaxed">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
