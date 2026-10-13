import type { AnimeSummary, CollectionBlock, CollectionComment, CollectionDetail } from "@animeshadow/shared";
import {
  BookmarkIcon,
  CheckIcon,
  HeartIcon,
  PlusIcon,
  Share2Icon,
  AlertTriangleIcon,
  BadgeCheckIcon,
  EyeOffIcon,
  InfoIcon,
  LightbulbIcon,
  ListOrderedIcon,
  TvIcon,
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
import { type ReactNode, useEffect, useState } from "react";
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
  useFavoriteCollection,
  useLibrary,
  useLikeCollection,
  useUpsertLibraryEntry,
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
    <article
      className="mx-auto flex max-w-4xl flex-col gap-6 py-4 sm:py-6"
      // One look for every collection: the site's own colours (an author's
      // accent is kept in the data but not applied).
    >
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
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <PencilIcon className="size-3.5" />
                {t("common.edit")}
              </Link>
              <Link
                to={`/collections/stats?open=${c.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
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

      <Actions collection={c} />
      <Overview collection={c} />
      <Body collection={c} />

      <RatePanel collection={c} />
      {c.allowComments ? (
        <Comments collectionId={c.id} />
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--accent-line-soft)] p-4 text-center text-sm text-muted-foreground">
          {t("collections.commentsClosed")}
        </p>
      )}
    </article>
  );
}

/** 1-based position of the anime block at `blockIndex` among all anime. */
function animeIndex(c: CollectionDetail, blockIndex: number): number {
  return c.blocks.slice(0, blockIndex + 1).filter((b) => b.type === "anime").length;
}

type AnimeBlock = Extract<CollectionBlock, { type: "anime" }>;

/** Like, save, share and a way to the rating — right under the title. */
function Actions({ collection: c }: { collection: CollectionDetail }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const like = useLikeCollection(c.id);
  const fav = useFavoriteCollection(c.id);
  const authed = status === "authenticated";
  const need = (run: () => void) => () => (authed ? run() : navigate("/login", { state: { from: window.location.pathname } }));
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: c.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Ссылка скопирована");
      }
    } catch {
      // Closed the share sheet — nothing to do.
    }
  };
  const btn = "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-[background-color,border-color,color,transform] active:scale-95";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={c.liked}
        onClick={need(() => like.mutate(!c.liked))}
        className={cn(btn, c.liked ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-border/70 bg-card/60 hover:border-rose-400/50 hover:text-rose-300")}
      >
        <HeartIcon className={cn("size-4 transition-transform", c.liked && "scale-110 fill-current")} />
        <span className="tabular-nums">{c.likeCount}</span>
      </button>
      <button
        type="button"
        aria-pressed={c.favorited}
        onClick={need(() =>
          fav.mutate(!c.favorited, { onSuccess: () => toast.success(c.favorited ? "Убрано из избранного" : "Сохранено в избранное") }),
        )}
        className={cn(btn, c.favorited ? "border-primary/50 bg-primary/15 text-primary" : "border-border/70 bg-card/60 hover:border-primary/40 hover:text-primary")}
      >
        <BookmarkIcon className={cn("size-4", c.favorited && "fill-current")} />
        {c.favorited ? "В избранном" : "В избранное"}
      </button>
      <button type="button" onClick={() => void share()} className={cn(btn, "border-border/70 bg-card/60 hover:border-foreground/30")}>
        <Share2Icon className="size-4" />
        Поделиться
      </button>
      {!c.canEdit && (
        <a href="#rate" className={cn(btn, "border-border/70 bg-card/60 hover:border-amber-400/50 hover:text-amber-300")}>
          <StarIcon className={cn("size-4", c.myRating && "fill-amber-400 text-amber-400")} />
          {c.myRating ? `Ваша оценка ${c.myRating}/10` : "Оценить"}
        </a>
      )}
    </div>
  );
}

/** "Add to my list" on a title of a collection — or where it already is. */
function ListButton({ animeId, compact = false }: { animeId: number; compact?: boolean }) {
  const labels = useLabels();
  const { status } = useAuth();
  const navigate = useNavigate();
  const { data: library } = useLibrary(undefined, status === "authenticated");
  const upsert = useUpsertLibraryEntry();
  const entry = library?.find((e) => e.anime.id === animeId);
  if (entry) {
    return (
      <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground/[0.07] px-2.5 text-xs font-semibold text-foreground/85", compact && "h-7 px-2 text-[11px]")}>
        <CheckIcon className="size-3.5" />
        {labels.statusLabel(entry.status)}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={upsert.isPending}
      onClick={() => {
        if (status !== "authenticated") {
          navigate("/login", { state: { from: window.location.pathname } });
          return;
        }
        upsert.mutate({ animeId, input: { status: "PLANNED" } }, { onSuccess: () => toast.success("Добавлено в «Запланировано»") });
      }}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 px-2.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-60",
        compact && "h-7 w-full justify-center px-2 text-[11px]",
      )}
    >
      <PlusIcon className="size-3.5" />В мой список
    </button>
  );
}

/** What's inside, at a glance: the sections (as links) and the totals. */
function Overview({ collection: c }: { collection: CollectionDetail }) {
  const t = useT();
  const headings = c.blocks.flatMap((b, i) => (b.type === "heading" ? [{ i, text: b.text }] : []));
  const list = Object.values(c.anime);
  const episodes = list.reduce((sum, a) => sum + (a.episodes ?? 0), 0);
  const hours = Math.round((episodes * 24) / 60);
  const scored = list.filter((a) => a.score != null);
  const avg = scored.length > 0 ? scored.reduce((sum, a) => sum + a.score!, 0) / scored.length : null;
  const { status } = useAuth();
  const { data: library } = useLibrary(undefined, status === "authenticated");
  const seen = library ? list.filter((a) => library.some((e) => e.anime.id === a.id && e.status === "COMPLETED")).length : null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <TvIcon className="size-4 text-primary" />
        <span className="font-semibold">{t("collections.totals", { n: c.animeCount, eps: episodes, hours })}</span>
        {avg != null && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
            {t("collections.avgScore", { score: avg.toFixed(2) })}
          </span>
        )}
      </p>
      {seen != null && list.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(seen / list.length) * 100}%` }} />
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {seen === list.length ? "Всё просмотрено" : `Вы посмотрели ${seen} из ${list.length}`}
          </span>
        </div>
      )}
      {headings.length >= 2 && (
        <nav className="flex flex-col gap-1.5 border-t border-[var(--accent-line-soft)] pt-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListOrderedIcon className="size-3.5" />
            {t("collections.contents")}
          </span>
          <ol className="flex flex-col gap-1">
            {headings.map((h, n) => (
              <li key={h.i}>
                <a href={`#sec-${h.i}`} className="text-sm transition-colors hover:text-primary">
                  <span className="mr-2 tabular-nums text-muted-foreground">{n + 1}.</span>
                  {h.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
    </div>
  );
}

/**
 * The body: every block in order. In a grid collection, anime that follow
 * one another share a grid of posters; text, sections and the rest break it.
 */
function Body({ collection: c }: { collection: CollectionDetail }) {
  const out: ReactNode[] = [];
  let tiles: ReactNode[] = [];
  const flush = () => {
    if (tiles.length === 0) return;
    out.push(
      <div key={`grid-${out.length}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles}
      </div>,
    );
    tiles = [];
  };
  c.blocks.forEach((block, i) => {
    if (block.type === "anime") {
      const anime = c.anime[block.animeId];
      if (!anime) return;
      const index = animeIndex(c, i);
      if (c.layout === "grid") {
        tiles.push(<AnimeTile key={i} anime={anime} block={block} index={index} />);
        return;
      }
      flush();
      out.push(<AnimeEmbed key={i} anime={anime} block={block} author={c.author.displayName} index={index} ranked={c.layout === "ranked"} />);
      return;
    }
    flush();
    out.push(<PlainBlock key={i} block={block} index={i} />);
  });
  flush();
  return <div className="flex flex-col gap-5">{out}</div>;
}

const CALLOUT_LOOK = {
  tip: { icon: LightbulbIcon, tone: "border-border/70 bg-card/60", iconTone: "text-primary" },
  warning: { icon: AlertTriangleIcon, tone: "border-primary/35 bg-primary/[0.06]", iconTone: "text-primary" },
  info: { icon: InfoIcon, tone: "border-border/70 bg-card/60", iconTone: "text-muted-foreground" },
} as const;

function PlainBlock({ block, index }: { block: Exclude<CollectionBlock, AnimeBlock>; index: number }) {
  const t = useT();
  switch (block.type) {
    case "text":
      return (
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90 sm:text-base">
          {block.text.split(/\n{2,}/).map((para, j) => (
            <p key={j} className="whitespace-pre-line">
              {para}
            </p>
          ))}
        </div>
      );
    case "heading":
      return (
        <h2 id={`sec-${index}`} className="scroll-mt-24 border-l-4 border-primary pl-3 font-display text-2xl leading-tight sm:text-3xl">
          {block.text}
        </h2>
      );
    case "quote":
      return (
        <figure className="relative rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 px-5 py-4 pl-12">
          <QuoteIcon className="absolute left-4 top-4 size-5 text-primary" />
          <blockquote className="whitespace-pre-line text-lg italic leading-relaxed">{block.text}</blockquote>
          {block.by && <figcaption className="mt-2 text-sm font-semibold text-muted-foreground">— {block.by}</figcaption>}
        </figure>
      );
    case "callout": {
      const look = CALLOUT_LOOK[block.variant];
      return (
        <aside className={cn("flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed", look.tone)}>
          <look.icon className={cn("mt-0.5 size-5 shrink-0", look.iconTone)} />
          <div className="min-w-0">
            <p className="mb-0.5 text-xs font-bold uppercase tracking-wide opacity-80">
              {t(`collections.editor.callout.${block.variant}` as "collections.editor.callout.tip")}
            </p>
            <p className="whitespace-pre-line text-foreground/90">{block.text}</p>
          </div>
        </aside>
      );
    }
    case "divider":
      return (
        <div aria-hidden className="flex items-center gap-3 py-1 text-primary/60">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--accent-line-soft)]" />
          <span className="font-display text-sm">影</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--accent-line-soft)]" />
        </div>
      );
  }
}

/** The author's note — or, marked as a spoiler, a button that shows it. */
function Note({ block, author, compact = false }: { block: AnimeBlock; author?: string; compact?: boolean }) {
  const t = useT();
  const [shown, setShown] = useState(!block.spoiler);
  if (!block.note) return null;
  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-[var(--accent-line-soft)] px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <EyeOffIcon className="size-3.5" />
        {t("collections.showSpoiler")}
      </button>
    );
  }
  if (compact) return <p className="line-clamp-3 text-xs text-muted-foreground">{block.note}</p>;
  return (
    <blockquote className="relative mt-1 rounded-xl border-l-2 border-primary bg-card/60 p-3 pl-9 text-sm leading-relaxed">
      <QuoteIcon className="absolute left-2.5 top-3 size-4 text-primary/70" />
      <span className="whitespace-pre-line">{block.note}</span>
      {author && <span className="mt-1.5 block text-[11px] font-semibold text-muted-foreground">— {author}</span>}
    </blockquote>
  );
}

/** The author's own marks on a title: their score, "must watch", how to watch. */
function Marks({ block }: { block: AnimeBlock }) {
  const t = useT();
  if (block.score == null && !block.mustWatch) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {block.score != null && (
        <span title={t("collections.authorScore")} className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
          <StarIcon className="size-3 fill-current" />
          {block.score}/10
        </span>
      )}
      {block.mustWatch && (
        <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 text-xs font-semibold text-foreground">
          <BadgeCheckIcon className="size-3 text-primary" />
          {t("collections.mustWatch")}
        </span>
      )}
    </span>
  );
}

function AnimeEmbed({
  anime,
  block,
  author,
  index,
  ranked,
}: {
  anime: AnimeSummary;
  block: AnimeBlock;
  author: string;
  index: number;
  ranked: boolean;
}) {
  const t = useT();
  const labels = useLabels();
  const meta = [labels.typeLabel(anime.type), labels.seasonYearLabel(anime)].filter(Boolean).join(" · ");
  return (
    <section
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-[var(--accent-surface)] p-3 sm:flex-row sm:p-4",
        "border-[var(--accent-line-soft)]",
      )}
    >
      {ranked && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-2 -top-6 select-none font-display text-[7rem] leading-none text-primary/10 sm:text-[9rem]"
        >
          {index}
        </span>
      )}
      <Link to={animeHref(anime)} viewTransition className="group relative shrink-0 self-center sm:self-start">
        <span className="block aspect-[2/3] w-32 overflow-hidden rounded-xl border border-border/70 sm:w-36">
          {anime.imageUrl && (
            <img
              src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </span>
        <span
          className={cn(
            "absolute -left-2 -top-2 grid place-items-center rounded-full bg-primary font-display text-primary-foreground shadow-lg",
            ranked ? "size-11 text-lg" : "size-8 text-sm",
          )}
        >
          {ranked ? `#${index}` : index}
        </span>
      </Link>
      <div className="relative flex min-w-0 flex-1 flex-col gap-2">
        <Link to={animeHref(anime)} viewTransition className="font-display text-xl leading-tight transition-colors hover:text-primary">
          {labels.title(anime)}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {meta && <span>{meta}</span>}
          {anime.episodes != null && <span>· {anime.episodes} эп.</span>}
          {anime.score != null && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-500">
              <StarIcon className="size-3 fill-current" />
              {anime.score.toFixed(2)}
            </span>
          )}
        </div>
        <Marks block={block} />
        {anime.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {anime.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {labels.genreLabel(g)}
              </span>
            ))}
          </div>
        )}
        {block.watchTip && (
          <p className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground/[0.06] px-2 py-1 text-xs text-foreground/85">
            <InfoIcon className="size-3.5 text-muted-foreground" />
            {block.watchTip}
          </p>
        )}
        {block.note ? (
          <Note block={block} author={author} />
        ) : (
          anime.synopsis && <p className="line-clamp-3 text-sm text-muted-foreground">{anime.synopsis}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <ListButton animeId={anime.id} />
          <Link
            to={animeHref(anime)}
            viewTransition
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            {t("collections.openAnime")}
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** A grid collection's card: the poster, its place, the title, the author's marks. */
function AnimeTile({ anime, block, index }: { anime: AnimeSummary; block: AnimeBlock; index: number }) {
  const labels = useLabels();
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-[var(--accent-surface)] p-2", block.mustWatch ? "border-primary/50" : "border-[var(--accent-line-soft)]")}>
      <Link to={animeHref(anime)} viewTransition className="group relative block">
        <span className="block aspect-[2/3] overflow-hidden rounded-xl bg-muted">
          {anime.imageUrl && (
            <img
              src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </span>
        <span className="absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-primary font-display text-xs text-primary-foreground shadow">{index}</span>
        {block.score != null && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
            <StarIcon className="size-3 fill-amber-400 text-amber-400" />
            {block.score}
          </span>
        )}
      </Link>
      <Link to={animeHref(anime)} viewTransition className="line-clamp-2 px-0.5 text-sm font-semibold leading-snug transition-colors hover:text-primary">
        {labels.title(anime)}
      </Link>
      {block.mustWatch && <Marks block={{ ...block, score: null }} />}
      {block.watchTip && <p className="px-0.5 text-[11px] text-muted-foreground">{block.watchTip}</p>}
      <div className="px-0.5">
        <Note block={block} compact />
      </div>
      <div className="mt-auto px-0.5 pb-0.5">
        <ListButton animeId={anime.id} compact />
      </div>
    </div>
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
/** A score's colour: the site's own, lighter for a low one. */
function scoreTone(v: number): string {
  return v <= 4 ? "bg-primary/50" : v <= 7 ? "bg-primary/75" : "bg-primary";
}

/**
 * Rating out of ten: the average, big, and how the votes spread — and the
 * viewer's own vote, ten numbered buttons coloured from red to green, with
 * a word for the one under the pointer.
 */
function RatePanel({ collection: c }: { collection: CollectionDetail }) {
  const t = useT();
  const { status } = useAuth();
  const rate = useRateCollection(c.id);
  const [hover, setHover] = useState<number | null>(null);
  const canRate = status === "authenticated" && !c.canEdit;
  const shown = hover ?? c.myRating ?? 0;
  const max = Math.max(1, ...c.ratingDist);
  const word = (v: number) => t(`collections.rate.${RATING_WORDS[Math.ceil(v / 2) - 1]}` as "collections.rate.ok");

  return (
    <section id="rate" className="grid scroll-mt-24 gap-4 rounded-2xl border border-border/70 bg-card/50 p-4 sm:grid-cols-[auto_1fr] sm:p-5">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="font-display text-5xl leading-none tabular-nums">{c.ratingAvg != null ? c.ratingAvg.toFixed(1) : "—"}</span>
          <span className="mt-1 text-xs text-muted-foreground">из 10</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">{t("collections.votes", { n: c.ratingCount })}</span>
        </div>
        <div className="flex h-20 items-end gap-0.5" aria-hidden>
          {c.ratingDist.map((n, i) => (
            <span key={i} className="flex w-3 flex-col items-center gap-0.5">
              <span className={cn("w-full rounded-sm", scoreTone(i + 1))} style={{ height: `${Math.max(3, (n / max) * 60)}px`, opacity: n > 0 ? 1 : 0.25 }} />
              <span className="text-[8px] tabular-nums text-muted-foreground">{i + 1}</span>
            </span>
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
            <div className="grid grid-cols-10 gap-1" onMouseLeave={() => setHover(null)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
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
                  aria-label={`${v} — ${word(v)}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-lg text-sm font-bold tabular-nums transition-[background-color,color,transform] hover:scale-110 sm:size-9",
                    v <= shown ? cn(scoreTone(shown), "text-white") : "bg-foreground/[0.07] text-muted-foreground",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className={cn("h-4 text-xs font-semibold", shown ? "text-foreground" : "text-muted-foreground")}>
              {shown ? `${shown}/10 · ${word(shown)}` : t("collections.rateHint")}
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
        <Link to="/login" className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-primary hover:bg-primary/5">
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
        <div className="ml-4 mt-3 flex flex-col gap-3 border-l-2 border-border/70 pl-3 sm:ml-10 sm:pl-4">
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
        className="w-full resize-y rounded-lg border border-border/70 bg-card/60 p-2.5 text-sm outline-none focus:border-primary"
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
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <SendIcon className="size-3.5" />
          {replyTo ? t("collections.reply") : t("collections.send")}
        </button>
      </div>
    </div>
  );
}
