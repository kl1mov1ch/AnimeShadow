import type { AnimeSummary, SearchGroup } from "@animeshadow/shared";
import Fuse from "fuse.js";
import { ClockIcon, SparklesIcon } from "lucide-react";
import { useMemo } from "react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
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

export const MOOD_CHIPS: Array<{ ru: string; en: string }> = [
  { ru: "грустное", en: "sad" },
  { ru: "весёлое", en: "funny" },
  { ru: "экшен", en: "action" },
  { ru: "романтика", en: "romance" },
  { ru: "исекай", en: "isekai" },
  { ru: "про космос", en: "space" },
  { ru: "уютное", en: "cozy" },
  { ru: "детектив", en: "detective" },
];

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
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ K" : "Ctrl K";
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
        "group animate-in fade-in zoom-in-95 relative inline-flex items-center gap-1 overflow-hidden rounded-full border px-2.5 py-1 text-xs transition-all duration-200 hover:-translate-y-0.5",
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

export function IdleState({
  recent,
  onClearRecent,
  moods,
  onPick,
  recentLabel,
  clearLabel,
  moodLabel,
  favoriteGenres,
  favoriteGenresLabel,
  onPickGenre,
}: {
  recent: string[];
  onClearRecent: () => void;
  moods: string[];
  onPick: (value: string) => void;
  recentLabel: string;
  clearLabel: string;
  moodLabel: string;
  favoriteGenres: Array<{ id: number; label: string }>;
  favoriteGenresLabel: string;
  onPickGenre: (id: number) => void;
}) {
  // One running counter across all three sections, so the chips cascade in
  // as a single wave instead of three simultaneous ones.
  let order = 0;
  return (
    <div className="flex flex-col gap-3.5 p-3">
      {/* Three distinct sections, not one shared bucket — history is
          something you did, favourite genres and mood are things you might
          want, and mixing all three together made it unclear which chip
          would search for a phrase and which would jump straight to a
          genre. */}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>{recentLabel}</SectionLabel>
            <button
              type="button"
              onClick={onClearRecent}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {clearLabel}
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
      {favoriteGenres.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>{favoriteGenresLabel}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {favoriteGenres.map((genre) => (
              <Chip
                key={genre.id}
                index={order++}
                accent
                onClick={() => onPickGenre(genre.id)}
              >
                <SparklesIcon className="size-3 shrink-0" />
                {genre.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <SectionLabel>{moodLabel}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {moods.map((value) => (
            <Chip key={value} index={order++} onClick={() => onPick(value)}>
              {value}
            </Chip>
          ))}
        </div>
      </div>
    </div>
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
