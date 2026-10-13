import type { AnimeSummary, CollectionSummary, SearchGroup, SearchPulse, UserCard } from "@animeshadow/shared";
import Fuse from "fuse.js";
import { ArrowLeftIcon, ClockIcon, FlameIcon, FolderHeartIcon, HandshakeIcon, LayersIcon, SearchIcon, SparklesIcon, StarIcon, TvIcon, UserCheckIcon, UsersIcon } from "lucide-react";
import { ProMark } from "@/components/common/pro-mark";
import { useMemo } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { useBrowse, useCollections, useSearchPeople, useSuggestedPeople } from "@/lib/query";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Everything the header's inline search and the ⌘K palette both need.
 *
 * These pieces used to live inside search-box.tsx as private helpers, which
 * meant a second search surface could only exist by copying them — two
 * implementations of "what a result row looks like" that would drift apart
 * the first time either was touched. One copy, two mounts.
 */

export type MatchMap = Map<number, ReadonlyArray<readonly [number, number]>>;

const RECENT_KEY = "animeshadow.recent.v1";
const RECENT_MAX = 6;

/** Total rows across every result group combined, so a dropdown never needs
 *  its own scrollbar — "see all results" is the way to the rest. */
export const MAX_DROPDOWN_RESULTS = 6;

export function readRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(term: string): string[] {
  const next = [term, ...readRecent().filter((x) => x !== term)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

/** The shortcut badge only ever claims what the platform actually uses. */
export function shortcutLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl + K";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ + K" : "Ctrl + K";
}

/** The same band of light the header's buttons sweep on hover, so every
 *  search surface reads as the same family of control. */
export function Sheen({ tone = "primary" }: { tone?: "primary" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
        tone === "light" ? "via-white/45" : "via-primary/30",
      )}
    />
  );
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-in fade-in slide-in-from-left-2 flex gap-2.5 duration-300"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
        >
          <Skeleton className="h-12 w-[34px] rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </p>
  );
}

export function Chip({
  children,
  onClick,
  index,
  accent = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  /** Position in the cascade — drives the entry delay, nothing else. */
  index: number;
  /** The "for you" chips, which jump straight to a genre rather than
   * filling the field, get the site colour so the difference is visible
   * before clicking rather than after. */
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 25}ms`, animationFillMode: "backwards" }}
      className={cn(
        "group animate-in fade-in zoom-in-95 relative inline-flex items-center gap-1 overflow-hidden rounded-lg border px-2.5 py-1 text-xs transition-all duration-200 hover:-translate-y-0.5",
        accent
          ? "border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15"
          : "border-border/60 bg-secondary/50 text-secondary-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      <span className="relative z-10 inline-flex items-center gap-1">{children}</span>
      <Sheen />
    </button>
  );
}

/** What the search looks through: titles, people's collections, or people. */
export type SearchMode = "anime" | "collections" | "people";

export function ModeSwitch({ mode, onMode }: { mode: SearchMode; onMode: (mode: SearchMode) => void }) {
  const { t } = useI18n();
  const options: Array<{ id: SearchMode; label: string; icon: typeof TvIcon }> = [
    { id: "anime", label: t("search.modeAnime"), icon: TvIcon },
    { id: "collections", label: t("search.modeCollections"), icon: LayersIcon },
    { id: "people", label: "Люди", icon: UsersIcon },
  ];
  return (
    <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-foreground/[0.05] p-1">
      {options.map((o) => {
        const on = o.id === mode;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            // The field keeps the focus: switching is not leaving the search.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onMode(o.id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-200",
              on ? "bg-card text-foreground shadow-sm ring-1 ring-[var(--accent-line-soft)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <o.icon className={cn("size-3.5", on && "text-primary")} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function IdleState({
  recent,
  onClearRecent,
  onPick,
  pulse,
  favoriteGenres,
  onPickGenre,
}: {
  recent: string[];
  onClearRecent: () => void;
  /** Fills the field with a phrase — the results show right here; only
   *  "see all" goes on to the catalog. */
  onPick: (value: string) => void;
  pulse: SearchPulse | undefined;
  favoriteGenres: Array<{ id: number; label: string }>;
  /** Shows the genre's most popular titles right here. */
  onPickGenre: (genre: { id: number; label: string }) => void;
}) {
  const { t } = useI18n();
  const labels = useLabels();
  // One running counter across the sections, so the chips cascade in as a
  // single wave instead of several at once.
  let order = 0;
  const searches = pulse?.searches ?? [];
  // While few people have searched yet, titles being watched fill in.
  const hot = searches.length < 4 ? (pulse?.hot ?? []).slice(0, 6 - searches.length) : [];
  return (
    <div className="flex flex-col gap-3.5 p-3">
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>{t("search.recent")}</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("common.clear")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((value) => (
              <Chip key={value} index={order++} onClick={() => onPick(value)}>
                <ClockIcon className="size-3 shrink-0 opacity-70" />
                {value}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {searches.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t("search.searchedNow")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {searches.map((s) => (
              <Chip key={s.term} index={order++} onClick={() => onPick(s.term)}>
                <FlameIcon className="size-3 shrink-0 text-orange-400" />
                {s.term}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {hot.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t("search.watchedNow")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {hot.map((a) => (
              <Chip key={a.id} index={order++} onClick={() => onPick(labels.title({ title: a.title, titleLocalized: a.titleLocalized, titleEnglish: null }))}>
                <TvIcon className="size-3 shrink-0 opacity-70" />
                <span className="max-w-[14rem] truncate">{labels.title({ title: a.title, titleLocalized: a.titleLocalized, titleEnglish: null })}</span>
              </Chip>
            ))}
          </div>
        </div>
      )}
      {(pulse?.genres.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t("search.popularGenres")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {pulse!.genres.map((g) => (
              <Chip key={g.id} index={order++} onClick={() => onPickGenre({ id: g.id, label: labels.genreLabel(g.name) })}>
                {labels.genreLabel(g.name)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {favoriteGenres.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{t("search.forYou")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {favoriteGenres.map((genre) => (
              <Chip key={genre.id} index={order++} accent onClick={() => onPickGenre(genre)}>
                <SparklesIcon className="size-3 shrink-0" />
                {genre.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {!pulse && recent.length === 0 && <LoadingRows count={2} />}
    </div>
  );
}

/**
 * A genre picked in the search: its most popular titles, right in the
 * panel, and a way on to the whole genre in the catalog.
 */
export function GenreResults({
  genre,
  onSelect,
  onSeeAll,
  onBack,
}: {
  genre: { id: number; label: string };
  onSelect: (anime: AnimeSummary) => void;
  onSeeAll: (id: number) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const labels = useLabels();
  const { data, isPending } = useBrowse({ genres: [genre.id], orderBy: "popularity", sort: "desc", page: 1, perPage: 6 });
  const items = data?.items ?? [];
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBack}
          aria-label={t("common.back")}
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
        </button>
        <SectionLabel>{t("search.genreTop", { genre: genre.label })}</SectionLabel>
      </div>
      {isPending && !data ? (
        <LoadingRows count={4} />
      ) : (
        <CommandGroup>
          {items.map((anime, i) => (
            <CommandItem
              key={anime.id}
              value={`genre-${anime.id}`}
              onSelect={() => onSelect(anime)}
              className="group animate-in fade-in slide-in-from-top-1 gap-2.5 rounded-xl py-1.5 duration-200 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20"
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
            >
              <span className="h-12 w-[34px] shrink-0 overflow-hidden rounded-md bg-muted">
                {anime.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium leading-snug">{labels.title(anime)}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[labels.typeLabel(anime.type), labels.seasonYearLabel(anime)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {anime.score != null && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums text-amber-500"><StarIcon className="size-3 fill-current" />{anime.score.toFixed(1)}</span>}
            </CommandItem>
          ))}
          <CommandItem
            value="genre-see-all"
            onSelect={() => onSeeAll(genre.id)}
            className="mt-1 justify-center rounded-lg bg-primary/10 py-2 text-sm font-semibold text-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground"
          >
            <SearchIcon />
            <span className="truncate">{t("search.genreAll", { genre: genre.label })}</span>
          </CommandItem>
        </CommandGroup>
      )}
    </div>
  );
}

/**
 * Collections in the search: the most popular while nothing is typed, the
 * ones that match once something is, and a way to all of them.
 */
export function CollectionResults({
  term,
  onSelect,
  onSeeAll,
}: {
  term: string;
  onSelect: (collection: CollectionSummary) => void;
  onSeeAll: (query: string) => void;
}) {
  const { t } = useI18n();
  const q = term.trim();
  const searching = q.length >= 2;
  const { data, isPending } = useCollections({ ...(searching ? { q } : {}), sort: "popular", page: 1, perPage: 6 });
  if (isPending && !data) return <LoadingRows count={4} />;
  const items = data?.items ?? [];
  if (items.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("search.collectionsNone")}</p>;
  }
  return (
    <CommandGroup
      heading={searching ? t("search.collectionsFound") : t("search.popularCollections")}
      className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
    >
      {items.map((c, i) => {
        const cover = c.cover.find((x) => x.image)?.image ?? null;
        return (
          <CommandItem
            key={c.id}
            value={`collection-${c.id}`}
            onSelect={() => onSelect(c)}
            className="group animate-in fade-in slide-in-from-top-1 gap-2.5 rounded-xl py-1.5 duration-200 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20"
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
          >
            <span className="grid h-12 w-[34px] shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
              {cover ? <img src={imageSrc(cover)} alt="" loading="lazy" className="size-full object-cover" /> : <FolderHeartIcon className="size-4" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium leading-snug">{c.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t("search.collectionMeta", { n: c.animeCount, author: c.author.displayName })}
              </span>
            </span>
          </CommandItem>
        );
      })}
      {searching && (
        <CommandItem
          value="collections-see-all"
          onSelect={() => onSeeAll(q)}
          className="mt-1 justify-center rounded-lg bg-primary/10 py-2 text-sm font-semibold text-primary data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground"
        >
          <SearchIcon />
          <span className="truncate">{t("search.collectionsAll", { query: q })}</span>
        </CommandItem>
      )}
    </CommandGroup>
  );
}

/**
 * People in the search: by nick or name once two letters are typed (with
 * or without "@"); before that, people worth meeting. Each row shows who
 * they are — face, name, nick, PRO — and how they relate to the viewer.
 */
export function PeopleResults({ term, onSelect }: { term: string; onSelect: (user: UserCard) => void }) {
  const q = term.trim();
  const searching = q.replace(/^@+/, "").length >= 2;
  const found = useSearchPeople(q, searching);
  const suggested = useSuggestedPeople(!searching);
  const data = searching ? found.data : suggested.data;
  const pending = searching ? found.isPending : suggested.isPending;
  if (pending && !data) return <LoadingRows count={4} />;
  const items = (data ?? []).slice(0, 8);
  if (items.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {searching ? "Никого не нашлось — попробуйте ник или часть имени." : "Найдите друзей по нику или имени."}
      </p>
    );
  }
  return (
    <CommandGroup
      heading={searching ? "Люди" : "Может, знакомы?"}
      className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
    >
      {items.map((u, i) => {
        const friends = u.following && u.followsYou;
        return (
          <CommandItem
            key={u.id}
            value={`person-${u.id}`}
            onSelect={() => onSelect(u)}
            className="group animate-in fade-in slide-in-from-top-1 gap-2.5 rounded-xl py-1.5 duration-200 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20"
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
          >
            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
              {u.avatarUrl ? <img src={imageSrc(u.avatarUrl)} alt="" loading="lazy" className="size-full object-cover" /> : u.displayName.charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug">
                <span className="truncate">{u.displayName}</span>
                {u.isPro && <ProMark className="text-[11px]" />}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {u.username ? `@${u.username}` : "без ника"} · {u.episodes} эп.
              </span>
            </span>
            {friends ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                <HandshakeIcon className="size-3" />
                Друзья
              </span>
            ) : u.following ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-violet-300">
                <UserCheckIcon className="size-3" />
                Подписаны
              </span>
            ) : u.followsYou ? (
              <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-sky-300">Читает вас</span>
            ) : null}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );
}

export function ResultGroup({
  group,
  items,
  heading,
  matches,
  onSelect,
  /** Bigger rows in the palette, compact ones in the header dropdown. */
  size = "compact",
}: {
  group: SearchGroup;
  items: AnimeSummary[];
  heading: string;
  matches: MatchMap;
  onSelect: (anime: AnimeSummary) => void;
  size?: "compact" | "roomy";
}) {
  const labels = useLabels();
  if (items.length === 0) return null;
  const roomy = size === "roomy";
  return (
    <CommandGroup
      heading={heading}
      className="[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
    >
      {items.map((anime, i) => (
        <CommandItem
          key={anime.id}
          value={`${group.reason}-${anime.id}`}
          onSelect={() => onSelect(anime)}
          className="group animate-in fade-in slide-in-from-top-1 gap-2.5 rounded-xl py-1.5 duration-200 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20"
          style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
        >
          <span
            className={cn(
              "shrink-0 overflow-hidden rounded-md bg-muted",
              roomy ? "h-16 w-[46px]" : "h-12 w-[34px]",
            )}
          >
            {anime.imageUrl && (
              <img
                src={imageSrc(anime.imageUrl)}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-110 group-data-[selected=true]:scale-110"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Highlighted
              text={labels.title(anime)}
              ranges={matches.get(anime.id)}
              className={roomy ? "text-sm font-semibold leading-snug" : "text-sm font-medium leading-snug"}
            />
            <span className="truncate text-xs text-muted-foreground">
              {[labels.typeLabel(anime.type), labels.seasonYearLabel(anime)]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {roomy && anime.synopsis && (
              <span className="line-clamp-1 text-xs text-muted-foreground/70">
                {anime.synopsis}
              </span>
            )}
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** Caps the TOTAL item count across every group combined (title, character,
 * mood, synopsis reasons can each contribute a group) so the panel always
 * shows a fixed, no-scroll handful — the rest lives behind "see all results". */
export function budgetGroups(
  groups: SearchGroup[],
  max: number,
): Array<{ group: SearchGroup; items: AnimeSummary[] }> {
  let remaining = max;
  const out: Array<{ group: SearchGroup; items: AnimeSummary[] }> = [];
  for (const group of groups) {
    if (remaining <= 0) break;
    const items = group.items.slice(0, remaining);
    remaining -= items.length;
    out.push({ group, items });
  }
  return out;
}

export function Highlighted({
  text,
  ranges,
  className,
}: {
  text: string;
  ranges: ReadonlyArray<readonly [number, number]> | undefined;
  className?: string;
}) {
  if (!ranges || ranges.length === 0) {
    return <span className={cn("truncate", className)}>{text}</span>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={start}
        className="rounded-[3px] bg-primary/25 px-0.5 font-semibold text-foreground"
      >
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <span className={cn("truncate", className)}>{parts}</span>;
}

export function useTitleMatches(flat: AnimeSummary[], query: string): MatchMap {
  return useMemo(() => {
    const map: MatchMap = new Map();
    if (flat.length === 0 || query.length < 2) return map;
    const fuse = new Fuse(flat, {
      keys: ["title", "titleEnglish", "titleJapanese"],
      includeMatches: true,
      threshold: 0.45,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    for (const result of fuse.search(query)) {
      const match = result.matches?.find((m) =>
        ["title", "titleEnglish", "titleJapanese"].includes(m.key ?? ""),
      );
      if (match?.indices?.length) {
        map.set(result.item.id, match.indices as ReadonlyArray<readonly [number, number]>);
      }
    }
    return map;
  }, [flat, query]);
}

export function groupHeading(
  group: SearchGroup,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (group.reason) {
    case "title":
      return t("search.groupTitle");
    case "character":
      return t("search.groupCharacter", { name: group.label ?? "" });
    case "studio":
      return t("search.groupStudio", { name: group.label ?? "" });
    case "mood":
      return t("search.groupMood");
    case "synopsis":
      return t("search.groupSynopsis");
    default:
      return "";
  }
}
