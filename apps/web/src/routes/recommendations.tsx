import type { AnimeSummary } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  HeartIcon,
  Loader2Icon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
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
 * Recommendation setup, as a walk rather than a form.
 *
 * The old version was a flat "heart things you like" grid: every pick was
 * independent, and nothing you chose changed what you were offered next. Here
 * each pick moves you one step down a chain — choose a title, get what's
 * similar to it, choose from those, and so on — so the page answers "and then
 * what?" instead of asking you to already know every title you like.
 *
 * Two distinct actions, deliberately kept separate:
 *  - clicking a tile walks to it (exploration; changes nothing on the server)
 *  - the heart saves it (the actual persisted taste signal the home rail uses)
 */
export function Component() {
  const t = useT();
  const labels = useLabels();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";

  // The walk so far. The last entry is what "similar" is being shown for;
  // earlier entries stay clickable so a dead end costs one click, not a reset.
  const [chain, setChain] = useState<AnimeSummary[]>([]);
  const focus = chain.at(-1) ?? null;

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 300);
  const searching = debounced.length >= 2;

  const { data: liked, isPending: likedPending } = useLikedAnime(isAuthed);
  const search = useSmartSearch(debounced, searching);
  const popular = useBrowse({ orderBy: "popularity", perPage: 12 }, !searching && !focus);
  const similar = useSimilarAnime(focus?.id ?? 0, focus != null);
  const like = useLikeAnime();
  const unlike = useUnlikeAnime();

  if (authStatus !== "loading" && !isAuthed) {
    return (
      <EmptyState
        title={t("recommendations.signedOutTitle")}
        description={t("recommendations.signedOutBody")}
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("common.createAccount")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const likedIds = new Set((liked ?? []).map((a) => a.id));

  const toggleLike = (anime: AnimeSummary) => {
    if (likedIds.has(anime.id)) unlike.mutate(anime.id);
    else like.mutate(anime.id);
  };

  /** Walk to a title. Re-picking something already in the chain rewinds to
   *  it rather than appending a duplicate, so the trail can't loop. */
  const walkTo = (anime: AnimeSummary) => {
    setChain((prev) => {
      const at = prev.findIndex((a) => a.id === anime.id);
      return at >= 0 ? prev.slice(0, at + 1) : [...prev, anime];
    });
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const searchResults = search.data?.flat ?? [];
  const similarItems = (similar.data?.items ?? []).filter(
    // Never offer a step back onto somewhere the walk has already been.
    (item) => !chain.some((a) => a.id === item.id),
  );

  return (
    <div className="reveal-group mx-auto flex max-w-5xl flex-col gap-8 py-6">
      <Header />

      <SearchField
        value={query}
        onChange={setQuery}
        busy={search.isFetching && searching}
        placeholder={t("recommendations.searchPlaceholder")}
      />

      {chain.length > 0 && (
        <Trail chain={chain} onPick={walkTo} onReset={() => setChain([])} />
      )}

      {/* One panel at a time: search results while typing, otherwise the
          next step of the walk, otherwise the starting grid. */}
      {searching ? (
        <Panel
          index={3}
          title={t("recommendations.searchResults")}
          busy={search.isFetching && searchResults.length === 0}
          empty={!search.isFetching && searchResults.length === 0}
          emptyLabel={t("search.noMatches")}
        >
          <TileGrid
            items={searchResults}
            likedIds={likedIds}
            onWalk={walkTo}
            onToggleLike={toggleLike}
          />
        </Panel>
      ) : focus ? (
        <Panel
          index={3}
          title={t("recommendations.similarTo", { title: labels.title(focus) })}
          caption={t("recommendations.walkHint")}
          busy={similar.isPending}
          empty={!similar.isPending && similarItems.length === 0}
          emptyLabel={t("recommendations.noSimilar")}
        >
          <TileGrid
            items={similarItems}
            likedIds={likedIds}
            onWalk={walkTo}
            onToggleLike={toggleLike}
          />
        </Panel>
      ) : (
        <Panel
          index={3}
          title={t("recommendations.startHeading")}
          caption={t("recommendations.startBody")}
          busy={popular.isPending}
        >
          <TileGrid
            items={popular.data?.items ?? []}
            likedIds={likedIds}
            onWalk={walkTo}
            onToggleLike={toggleLike}
          />
        </Panel>
      )}

      <SavedPanel
        items={liked ?? []}
        pending={likedPending}
        onWalk={walkTo}
        onToggleLike={toggleLike}
      />

      <p className="reveal text-xs text-muted-foreground/70" style={step(6)}>
        {t("recommendations.genreHint")}{" "}
        <Link to="/profile?tab=settings" className="text-primary hover:underline">
          {t("profile.tabs.settings")}
        </Link>
      </p>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Header() {
  const t = useT();
  return (
    <header
      className="reveal relative flex flex-col gap-2 overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-5 sm:p-7"
      style={step(0)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      {/* The site mark, used as a watermark the way it is on the other
          rebuilt pages. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 -top-8 select-none font-display text-[10rem] leading-none text-foreground/[0.03]"
      >
        影
      </span>
      <div className="flex items-center gap-2 text-primary">
        <SparklesIcon className="size-5" />
        <span className="text-sm font-medium uppercase tracking-wide">
          {t("recommendations.eyebrow")}
        </span>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl">{t("recommendations.title")}</h1>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        {t("recommendations.lead")}
      </p>
    </header>
  );
}

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
    <div className="reveal" style={step(1)}>
      {/* The same pill and focus bloom as the header's search, so the two
          read as one control in two places. */}
      <div className="group relative flex items-center rounded-full border border-border/60 bg-card/70 transition-all duration-200 focus-within:border-primary/50 focus-within:bg-card focus-within:shadow-lg focus-within:shadow-primary/10 focus-within:ring-4 focus-within:ring-primary/15">
        <SearchIcon className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground transition-all duration-200 group-focus-within:scale-110 group-focus-within:text-primary" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-full bg-transparent pl-10 pr-12 text-sm outline-none placeholder:text-muted-foreground/80"
        />
        <div className="absolute right-3 flex items-center gap-1">
          {busy && <Loader2Icon className="size-3.5 animate-spin text-primary" />}
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={t("common.clear")}
              className="animate-in zoom-in-75 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The walk so far, as a rewindable trail. */
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
    <div
      className="reveal flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-3"
      style={step(2)}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {t("recommendations.trailLabel")}
      </span>
      {chain.map((anime, i) => {
        const last = i === chain.length - 1;
        return (
          <span key={anime.id} className="flex items-center gap-2">
            {i > 0 && (
              <ArrowRightIcon aria-hidden className="size-3 shrink-0 text-muted-foreground/50" />
            )}
            <button
              type="button"
              onClick={() => onPick(anime)}
              aria-current={last ? "step" : undefined}
              className={cn(
                "group relative max-w-[14rem] overflow-hidden rounded-full border px-3 py-1 text-xs transition-all duration-200 hover:-translate-y-0.5",
                last
                  ? "border-primary/40 bg-primary/15 font-medium text-primary"
                  : "border-border/60 bg-secondary/50 text-secondary-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className="relative z-10 block truncate">{labels.title(anime)}</span>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
              />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onReset}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-all duration-200 hover:bg-secondary/60 hover:text-foreground"
      >
        <RotateCcwIcon className="size-3" />
        {t("recommendations.restart")}
      </button>
    </div>
  );
}

function Panel({
  index,
  title,
  caption,
  busy = false,
  empty = false,
  emptyLabel,
  children,
}: {
  index: number;
  title: string;
  caption?: string;
  busy?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="reveal flex flex-col gap-3" style={step(index)}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg tracking-tight sm:text-xl">{title}</h2>
        {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
      </div>
      {busy ? (
        <TileGridSkeleton />
      ) : empty ? (
        <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function SavedPanel({
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
  return (
    <section className="reveal flex flex-col gap-3" style={step(5)}>
      <h2 className="font-display text-lg tracking-tight sm:text-xl">
        {t("recommendations.likedHeading", { count: items.length })}
      </h2>
      {pending ? (
        <TileGridSkeleton count={6} />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
          {t("recommendations.likedEmpty")}
        </p>
      ) : (
        <TileGrid
          items={items}
          likedIds={new Set(items.map((a) => a.id))}
          onWalk={onWalk}
          onToggleLike={onToggleLike}
        />
      )}
    </section>
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
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((anime, i) => (
        <Tile
          key={anime.id}
          anime={anime}
          index={i}
          liked={likedIds.has(anime.id)}
          onWalk={onWalk}
          onToggleLike={onToggleLike}
        />
      ))}
    </div>
  );
}

/**
 * One title. The poster itself is the "walk here" control; the heart and the
 * open-page link are separate buttons layered over it — which is why this is
 * a div of buttons rather than a button containing buttons.
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
      className="animate-in fade-in slide-in-from-bottom-2 group flex flex-col gap-1.5 duration-300"
      style={{ animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-border/60 bg-muted transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-lg group-hover:shadow-primary/10">
        <button
          type="button"
          onClick={() => onWalk(anime)}
          aria-label={t("recommendations.walkTo", { title })}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {anime.imageUrl ? (
            <img
              src={imageSrc(anime.imageUrl)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <PosterFallback title={anime.title} seed={anime.id} />
          )}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          />
          {/* What a click actually does, spelled out on hover — the whole
              point of the page is that picking continues the walk, and a
              bare poster doesn't say that. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex translate-y-1 items-center justify-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-foreground opacity-0 backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
          >
            {t("recommendations.showSimilar")}
            <ArrowRightIcon className="size-2.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleLike(anime)}
          aria-pressed={liked}
          aria-label={
            liked
              ? t("recommendations.unlike", { title })
              : t("recommendations.like", { title })
          }
          className={cn(
            "absolute right-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full backdrop-blur transition-all duration-200 hover:scale-110",
            liked
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
              : "bg-background/70 text-foreground/80 hover:text-primary",
          )}
        >
          <HeartIcon className={cn("size-3.5", liked && "fill-current")} />
        </button>

        <Link
          to={animeHref(anime)}
          aria-label={t("recommendations.openPage", { title })}
          className="absolute left-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-background/70 text-foreground/70 opacity-0 backdrop-blur transition-all duration-200 hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
        >
          <ExternalLinkIcon className="size-3" />
        </Link>
      </div>
      <span className="line-clamp-2 text-xs font-medium leading-snug transition-colors group-hover:text-primary">
        {title}
      </span>
    </div>
  );
}

function TileGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
