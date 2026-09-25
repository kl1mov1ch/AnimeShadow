import type { AnimeSummary } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  CompassIcon,
  ExternalLinkIcon,
  HeartIcon,
  Loader2Icon,
  LockIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { PageHero, SectionTitle } from "@/components/common/page-hero";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useBrowse,
  useLikeAnime,
  useLikedAnime,
  useSimilarAnime,
  useSmartSearch,
  useUnlikeAnime,
} from "@/lib/query";
import { cn } from "@/lib/utils";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Recommendation setup, as a walk rather than a form: choose a title, get
 * what's similar to it, choose from those, and so on — each pick moves the
 * walk one step, and the trail back is always one click.
 *
 * Two actions, kept apart on purpose: clicking a poster walks to it (changes
 * nothing on the server); the heart saves it — the taste signal the home
 * rails actually read. What's saved sits in its own column beside the walk
 * on a wide screen, so it is visible while you're adding to it.
 */
export function Component() {
  const t = useT();
  const labels = useLabels();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";

  const [chain, setChain] = useState<AnimeSummary[]>([]);
  const focus = chain.at(-1) ?? null;

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const searching = debounced.length >= 2;

  const { data: liked, isPending: likedPending } = useLikedAnime(isAuthed);
  const search = useSmartSearch(debounced, searching);
  const popular = useBrowse({ orderBy: "popularity", perPage: 18 }, !searching && !focus);
  const similar = useSimilarAnime(focus?.id ?? 0, focus != null);
  const like = useLikeAnime();
  const unlike = useUnlikeAnime();

  const hero = (children?: React.ReactNode) => (
    <div className="reveal" style={step(0)}>
      <PageHero
        icon={CompassIcon}
        eyebrow={t("recommendations.eyebrow")}
        title={t("recommendations.title")}
        lead={t("recommendations.lead")}
      >
        {children}
      </PageHero>
    </div>
  );

  if (authStatus !== "loading" && !isAuthed) {
    return (
      <div className="reveal-group mx-auto flex max-w-6xl flex-col gap-6 py-4 sm:py-6">
        {hero()}
        <section
          className="reveal flex flex-col items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-[var(--accent-surface)] p-8 text-center sm:p-12"
          style={step(1)}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/20">
            <LockIcon className="size-6" />
          </span>
          <p className="font-display text-lg">{t("recommendations.signedOutTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("recommendations.signedOutBody")}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Link
              to="/login"
              className="btn-sheen inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
            >
              {t("common.signIn")}
            </Link>
            <Link
              to="/register"
              className="inline-flex h-10 items-center rounded-lg border border-primary/35 bg-primary/10 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {t("common.createAccount")}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const likedIds = new Set((liked ?? []).map((a) => a.id));
  const toggleLike = (anime: AnimeSummary) => {
    if (likedIds.has(anime.id)) unlike.mutate(anime.id);
    else like.mutate(anime.id);
  };

  /** Walk to a title. Re-picking one already on the trail rewinds to it
   *  rather than appending a duplicate, so the trail can't loop. */
  const walkTo = (anime: AnimeSummary) => {
    setChain((prev) => {
      const at = prev.findIndex((a) => a.id === anime.id);
      return at >= 0 ? prev.slice(0, at + 1) : [...prev, anime];
    });
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const searchResults = search.data?.flat ?? [];
  const similarItems = (similar.data?.items ?? []).filter((item) => !chain.some((a) => a.id === item.id));

  return (
    <div className="reveal-group mx-auto flex max-w-6xl flex-col gap-6 py-4 sm:py-6">
      {hero(
        <SearchField
          value={query}
          onChange={setQuery}
          busy={search.isFetching && searching}
          placeholder={t("recommendations.searchPlaceholder")}
        />,
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {chain.length > 0 && <Trail chain={chain} onPick={walkTo} onReset={() => setChain([])} />}

          {searching ? (
            <Section
              icon={SearchIcon}
              title={t("recommendations.searchResults")}
              busy={search.isFetching && searchResults.length === 0}
              empty={!search.isFetching && searchResults.length === 0}
              emptyLabel={t("search.noMatches")}
            >
              <TileGrid items={searchResults} likedIds={likedIds} onWalk={walkTo} onToggleLike={toggleLike} />
            </Section>
          ) : focus ? (
            <>
              <FocusCard anime={focus} liked={likedIds.has(focus.id)} onToggleLike={toggleLike} />
              <Section
                icon={SparklesIcon}
                title={t("recommendations.similarTo", { title: labels.title(focus) })}
                caption={t("recommendations.walkHint")}
                busy={similar.isPending}
                empty={!similar.isPending && similarItems.length === 0}
                emptyLabel={t("recommendations.noSimilar")}
              >
                <TileGrid items={similarItems} likedIds={likedIds} onWalk={walkTo} onToggleLike={toggleLike} />
              </Section>
            </>
          ) : (
            <Section
              icon={CompassIcon}
              title={t("recommendations.startHeading")}
              caption={t("recommendations.startBody")}
              busy={popular.isPending}
            >
              <TileGrid items={popular.data?.items ?? []} likedIds={likedIds} onWalk={walkTo} onToggleLike={toggleLike} />
            </Section>
          )}
        </div>

        <SavedColumn items={liked ?? []} pending={likedPending} onWalk={walkTo} onToggleLike={toggleLike} />
      </div>

      <p className="reveal text-xs text-muted-foreground/70" style={step(6)}>
        {t("recommendations.genreHint")}{" "}
        <Link to="/profile" className="text-primary hover:underline">
          {t("profile.studio.open")}
        </Link>
      </p>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function SearchField({
  value,
  onChange,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  placeholder: string;
}) {
  const t = useT();
  return (
    <div className="group relative mt-1 flex max-w-xl items-center rounded-xl border border-primary/30 bg-background/80 transition-all duration-200 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
      <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl bg-transparent pl-10 pr-12 text-sm outline-none placeholder:text-muted-foreground/80"
      />
      <div className="absolute right-3 flex items-center gap-1">
        {busy && <Loader2Icon className="size-3.5 animate-spin text-primary" />}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("common.clear")}
            className="grid size-6 animate-in place-items-center rounded-md text-muted-foreground zoom-in-75 hover:bg-primary/15 hover:text-primary"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** The walk so far: poster steps joined by a line, each one a way back. */
function Trail({
  chain,
  onPick,
  onReset,
}: {
  chain: AnimeSummary[];
  onPick: (anime: AnimeSummary) => void;
  onReset: () => void;
}) {
  const t = useT();
  const labels = useLabels();
  return (
    <div className="reveal flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3" style={step(1)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("recommendations.trailLabel")} · {chain.length}
        </span>
        <button
          type="button"
          onClick={onReset}
          className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <RotateCcwIcon className="size-3 transition-transform duration-500 group-hover:-rotate-180" />
          {t("recommendations.restart")}
        </button>
      </div>
      <ol className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {chain.map((anime, i) => {
          const last = i === chain.length - 1;
          return (
            <li key={anime.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span aria-hidden className="h-0.5 w-5 rounded-full bg-gradient-to-r from-primary/30 to-primary" />}
              <button
                type="button"
                onClick={() => onPick(anime)}
                aria-current={last ? "step" : undefined}
                title={labels.title(anime)}
                className={cn(
                  "flex max-w-[12rem] items-center gap-2 rounded-lg border p-1 pr-2.5 text-xs transition-all duration-200",
                  last
                    ? "border-primary bg-primary/15 font-semibold text-primary shadow-md shadow-primary/15"
                    : "border-[var(--accent-line-soft)] bg-card/60 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                <span className="h-9 w-6 shrink-0 overflow-hidden rounded bg-muted">
                  {anime.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" className="size-full object-cover" />}
                </span>
                <span className="truncate">{labels.title(anime)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Where the walk stands: the title whose neighbours are shown below. */
function FocusCard({
  anime,
  liked,
  onToggleLike,
}: {
  anime: AnimeSummary;
  liked: boolean;
  onToggleLike: (anime: AnimeSummary) => void;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);
  const meta = [labels.typeLabel(anime.type), labels.seasonYearLabel(anime), anime.score ? `★ ${anime.score.toFixed(2)}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      key={anime.id}
      className="relative flex animate-in gap-4 overflow-hidden rounded-2xl border border-primary/40 p-3 fade-in-0 zoom-in-95 duration-300 sm:p-4"
    >
      {anime.imageUrl && (
        <img aria-hidden src={imageSrc(anime.imageUrl)} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl" />
      )}
      <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/60" />
      <span className="relative h-32 w-[5.5rem] shrink-0 overflow-hidden rounded-xl border border-primary/30 shadow-lg shadow-primary/15 sm:h-36 sm:w-24">
        {anime.imageUrl ? (
          <img src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)} alt="" className="size-full object-cover" />
        ) : (
          <PosterFallback title={anime.title} seed={anime.id} />
        )}
      </span>
      <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t("recommendations.youAreHere")}</span>
        <h2 className="line-clamp-2 font-display text-lg leading-tight sm:text-xl">{title}</h2>
        {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        {anime.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {anime.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {labels.genreLabel(g)}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onToggleLike(anime)}
            aria-pressed={liked}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all active:scale-95",
              liked
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                : "border border-primary/35 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <HeartIcon className={cn("size-3.5", liked && "fill-current")} />
            {liked ? t("recommendations.saved") : t("recommendations.save")}
          </button>
          <Link
            to={animeHref(anime)}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-line-soft)] bg-card/70 px-3 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            <ExternalLinkIcon className="size-3.5" />
            {t("recommendations.openTitle")}
          </Link>
        </div>
      </div>
    </article>
  );
}

function Section({
  icon,
  title,
  caption,
  busy = false,
  empty = false,
  emptyLabel,
  children,
}: {
  icon: typeof SparklesIcon;
  title: string;
  caption?: string;
  busy?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="reveal flex flex-col gap-3" style={step(2)}>
      <SectionTitle icon={icon} title={title} note={caption} />
      {busy ? (
        <TileGridSkeleton />
      ) : empty ? (
        <p className="rounded-2xl border border-dashed border-primary/30 p-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        children
      )}
    </section>
  );
}

/** What's saved — beside the walk on a wide screen, below it on a phone. */
function SavedColumn({
  items,
  pending,
  onWalk,
  onToggleLike,
}: {
  items: AnimeSummary[];
  pending: boolean;
  onWalk: (anime: AnimeSummary) => void;
  onToggleLike: (anime: AnimeSummary) => void;
}) {
  const t = useT();
  const labels = useLabels();
  return (
    <aside
      className="reveal flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)]"
      style={step(3)}
    >
      <h2 className="flex items-center gap-2 font-display text-base">
        <HeartIcon className="size-4 fill-primary text-primary" />
        {t("recommendations.likedHeading", { count: items.length })}
      </h2>
      {pending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-primary/30 p-4 text-xs leading-relaxed text-muted-foreground">
          {t("recommendations.likedEmpty")}
        </p>
      ) : (
        <ul className="-mr-2 flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-2 [scrollbar-width:thin]">
          {items.map((anime) => (
            <li
              key={anime.id}
              className="group flex animate-in items-center gap-2.5 rounded-lg border border-transparent p-1 fade-in-0 slide-in-from-right-2 duration-300 hover:border-primary/30 hover:bg-primary/[0.06]"
            >
              <button type="button" onClick={() => onWalk(anime)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <span className="h-12 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
                  {anime.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                </span>
                <span className="line-clamp-2 text-xs font-medium leading-snug transition-colors group-hover:text-primary">
                  {labels.title(anime)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleLike(anime)}
                aria-label={t("recommendations.unlike", { title: labels.title(anime) })}
                className="grid size-7 shrink-0 place-items-center rounded-md text-primary opacity-60 transition-all hover:bg-primary/15 hover:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function TileGrid({
  items,
  likedIds,
  onWalk,
  onToggleLike,
}: {
  items: AnimeSummary[];
  likedIds: Set<number>;
  onWalk: (anime: AnimeSummary) => void;
  onToggleLike: (anime: AnimeSummary) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      {items.map((anime, i) => (
        <Tile key={anime.id} anime={anime} index={i} liked={likedIds.has(anime.id)} onWalk={onWalk} onToggleLike={onToggleLike} />
      ))}
    </div>
  );
}

/**
 * One title. The poster is the "walk here" control; the heart and the
 * open-page link sit over it as buttons of their own.
 */
function Tile({
  anime,
  index,
  liked,
  onWalk,
  onToggleLike,
}: {
  anime: AnimeSummary;
  index: number;
  liked: boolean;
  onWalk: (anime: AnimeSummary) => void;
  onToggleLike: (anime: AnimeSummary) => void;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(anime);

  return (
    <div
      className="group flex animate-in flex-col gap-1.5 fade-in slide-in-from-bottom-2 duration-300"
      style={{ animationDelay: `${Math.min(index, 18) * 30}ms`, animationFillMode: "backwards" }}
    >
      <div
        className={cn(
          "relative aspect-[2/3] overflow-hidden rounded-xl border bg-muted transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-primary/15",
          liked ? "border-primary/60" : "border-[var(--accent-line-soft)] group-hover:border-primary/50",
        )}
      >
        <button
          type="button"
          onClick={() => onWalk(anime)}
          aria-label={t("recommendations.walkTo", { title })}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {anime.imageUrl ? (
            <img
              src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <PosterFallback title={anime.title} seed={anime.id} />
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex translate-y-1 items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground opacity-0 shadow-md shadow-primary/30 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          >
            {t("recommendations.showSimilar")}
            <ArrowRightIcon className="size-2.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleLike(anime)}
          aria-pressed={liked}
          aria-label={liked ? t("recommendations.unlike", { title }) : t("recommendations.like", { title })}
          className={cn(
            "absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-lg transition-all duration-200 hover:scale-110 active:scale-90",
            liked ? "bg-primary text-primary-foreground shadow-md shadow-primary/40" : "bg-black/65 text-white hover:bg-primary",
          )}
        >
          <MorphIcon on={liked} off={HeartIcon} onIcon={HeartIcon} className={cn("size-3.5", liked && "fill-current")} />
        </button>

        <Link
          to={animeHref(anime)}
          aria-label={t("recommendations.openPage", { title })}
          className="absolute left-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-lg bg-black/65 text-white opacity-0 transition-all duration-200 hover:bg-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ExternalLinkIcon className="size-3" />
        </Link>
      </div>
      <span className="line-clamp-2 text-xs font-medium leading-snug transition-colors group-hover:text-primary">{title}</span>
    </div>
  );
}

function TileGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
