import type { AnimeSummary, SearchGroup, SearchReason } from "@animeshadow/shared";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  Building2Icon,
  ClockIcon,
  DicesIcon,
  FilterIcon,
  FlameIcon,
  type LucideIcon,
  SearchIcon,
  ShapesIcon,
  SmileIcon,
  SparklesIcon,
  StarIcon,
  TypeIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Fragment, useMemo } from "react";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useSearchTrending } from "@/lib/query";
import { cn } from "@/lib/utils";
import { MOOD_CHIPS } from "@/components/layout/search-shared";
import {
  catalogHrefFor,
  hasParsedFilters,
  QUICK_FILTERS,
  SCOPES,
  type SearchEngine,
} from "./search-engine";

/** What the search window can teach by example — each one a feature. */
const EXAMPLES: Array<{ q: string; hint: string }> = [
  { q: "похоже на Наруто", hint: "похожие тайтлы" },
  { q: "фильмы 2020", hint: "фильтры словами" },
  { q: "онгоинги романтика", hint: "жанр и статус" },
  { q: "Вторжение гигантов", hint: "другие названия" },
  { q: "JJK", hint: "сокращения" },
  { q: "аниме 90-х", hint: "десятилетия" },
];

const GROUP_ICON: Record<SearchReason, LucideIcon> = {
  title: TypeIcon,
  similar: ShapesIcon,
  character: UserRoundIcon,
  studio: Building2Icon,
  mood: SmileIcon,
  filters: FilterIcon,
  synopsis: BookOpenTextIcon,
};

function groupHeading(group: SearchGroup): string {
  switch (group.reason) {
    case "title":
      return "Названия";
    case "similar":
      return `Похоже на «${group.label ?? ""}»`;
    case "character":
      return `Персонаж · ${group.label ?? ""}`;
    case "studio":
      return `Студия · ${group.label ?? ""}`;
    case "mood":
      return "Под настроение";
    case "filters":
      return "Подходит под запрос";
    case "synopsis":
      return "Найдено в сюжете";
    default:
      return "";
  }
}

export interface SearchPanelProps {
  engine: SearchEngine;
  /** Rows shown across every group together; the rest is behind "all results". */
  max: number;
  recent: string[];
  onClearRecent: () => void;
  onOpenAnime: (anime: Pick<AnimeSummary, "id" | "slug">) => void;
  onNavigate: (to: string) => void;
  onSubmit: () => void;
  /** Smaller rows, for the header's dropdown. */
  compact?: boolean;
}

/**
 * The inside of a search surface — the header's dropdown and the search
 * window both render it, inside their own cmdk `Command` (so the arrow keys
 * and Enter work across the field and every row).
 *
 * Top to bottom: where to look (all, titles, characters, studios, plot),
 * then — once there are results — one-tap filters on them and what the
 * query was read as (a year, a format, "похоже на"), the results in groups,
 * and at the bottom "all results" and "I'm feeling lucky". Before anything
 * is typed: recent searches, examples of what it understands, what is being
 * watched now and moods.
 */
export function SearchPanel(props: SearchPanelProps) {
  const { engine } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/50 px-3 pb-2.5 pt-2.5">
        <ScopeTabs engine={engine} />
        {engine.showResults && engine.raw && engine.raw.flat.length > 0 && <QuickFilters engine={engine} />}
      </div>
      {/* The line that runs while the answer catches up with the typing. */}
      <div aria-hidden className="relative h-0.5 overflow-hidden">
        {engine.working && <span className="search-progress absolute inset-y-0 w-1/3 bg-primary/80" />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!engine.showResults ? (
          <IdleState {...props} />
        ) : engine.loading ? (
          <LoadingRows compact={props.compact} />
        ) : engine.result && engine.result.flat.length > 0 ? (
          <Results {...props} />
        ) : (
          <EmptyState engine={engine} />
        )}
      </div>
      {engine.showResults && engine.result && engine.result.flat.length > 0 && <Footer {...props} />}
    </div>
  );
}

function ScopeTabs({ engine }: { engine: SearchEngine }) {
  return (
    <div role="tablist" aria-label="Где искать" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SCOPES.map(({ key, label }) => {
        const on = engine.scope === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => engine.setScope(key)}
            className={cn(
              "relative shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200",
              on ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function QuickFilters({ engine }: { engine: SearchEngine }) {
  const all = engine.raw?.flat ?? [];
  return (
    <div className="-mx-1 flex animate-in gap-1.5 overflow-x-auto px-1 duration-200 fade-in-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {QUICK_FILTERS.map(({ key, label, test }) => {
        const on = engine.filters.has(key);
        const count = all.filter(test).length;
        if (count === 0 && !on) return null;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => engine.toggleFilter(key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 active:scale-95",
              on
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/60 bg-secondary/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            {label}
            <span className={cn("tabular-nums", on ? "text-primary/80" : "text-muted-foreground/60")}>{count}</span>
            {on && <XIcon className="size-3" />}
          </button>
        );
      })}
    </div>
  );
}

/** What the query was read as: "похоже на", a year, a format — and where to take it further. */
function ReadAs({ engine, onNavigate, onOpenAnime }: Pick<SearchPanelProps, "engine" | "onNavigate" | "onOpenAnime">) {
  const labels = useLabels();
  const result = engine.result;
  const parsed = result?.parsed;
  if (!result || !parsed) return null;
  const parts: string[] = [];
  if (parsed.type) parts.push(labels.typeLabel(parsed.type));
  if (parsed.airing) parts.push(labels.airingLabel(parsed.airing));
  if (parsed.yearFrom != null) {
    parts.push(parsed.yearTo != null && parsed.yearTo !== parsed.yearFrom ? `${parsed.yearFrom}–${parsed.yearTo}` : String(parsed.yearFrom));
  }
  const moods = result.detectedGenres.map((g) => labels.genreLabel(g));
  if (!parsed.similarTo && parts.length === 0 && moods.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 text-[11px] text-muted-foreground">
      <SparklesIcon className="size-3.5 text-primary" />
      <span>Понято как:</span>
      {parsed.similarTo && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onOpenAnime(parsed.similarTo!)}
          className="rounded-md bg-primary/12 px-1.5 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20"
        >
          похоже на «{parsed.similarTo.title}»
        </button>
      )}
      {[...parts, ...moods].map((p) => (
        <span key={p} className="rounded-md bg-foreground/[0.07] px-1.5 py-0.5 font-medium text-foreground/85">
          {p}
        </span>
      ))}
      {hasParsedFilters(parsed) && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onNavigate(catalogHrefFor(parsed))}
          className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          в каталоге <ArrowRightIcon className="size-3" />
        </button>
      )}
    </div>
  );
}

function Results(props: SearchPanelProps) {
  const { engine, max, compact, onOpenAnime } = props;
  const result = engine.result!;
  let left = max;
  const groups: Array<{ group: SearchGroup; items: AnimeSummary[] }> = [];
  for (const group of result.groups) {
    if (left <= 0) break;
    const items = group.items.slice(0, left);
    left -= items.length;
    groups.push({ group, items });
  }
  let order = 0;
  return (
    <>
      <ReadAs engine={engine} onNavigate={props.onNavigate} onOpenAnime={onOpenAnime} />
      {groups.map(({ group, items }, gi) => {
        const Icon = GROUP_ICON[group.reason];
        return (
          <CommandGroup
            key={`${group.reason}-${group.label ?? ""}-${gi}`}
            heading={
              <span className="flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {groupHeading(group)}
              </span>
            }
            className="[&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
          >
            {items.map((anime) => (
              <ResultRow
                key={anime.id}
                anime={anime}
                reason={group.reason}
                aka={result.aka?.[String(anime.id)]}
                query={engine.result?.parsed?.rest ?? engine.typed}
                index={order++}
                compact={compact}
                onOpen={() => onOpenAnime(anime)}
                onSimilar={() => {
                  engine.setScope("all");
                  engine.setTerm(`похоже на ${anime.titleLocalized ?? anime.title}`);
                }}
              />
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}

function ResultRow({
  anime,
  reason,
  aka,
  query,
  index,
  compact,
  onOpen,
  onSimilar,
}: {
  anime: AnimeSummary;
  reason: SearchReason;
  aka: string | undefined;
  query: string;
  index: number;
  compact?: boolean;
  onOpen: () => void;
  onSimilar: () => void;
}) {
  const labels = useLabels();
  const title = labels.title(anime);
  const facts = [
    labels.typeLabel(anime.type),
    anime.year ? String(anime.year) : null,
    anime.type !== "MOVIE" && anime.episodes ? `${anime.episodes} эп.` : null,
  ].filter(Boolean);
  return (
    <CommandItem
      value={`${reason}-${anime.id}`}
      onSelect={onOpen}
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms`, animationFillMode: "backwards" }}
      className="group/row animate-in gap-3 rounded-xl px-2 py-1.5 duration-200 fade-in-0 slide-in-from-top-1 data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground"
    >
      <span className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/5", compact ? "h-12 w-[34px]" : "h-14 w-10")}>
        {anime.imageUrl && (
          <img
            src={imageSrc(anime.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-data-[selected=true]/row:scale-110"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Marked text={title} query={query} className="text-sm font-semibold leading-snug" />
        {aka && (
          <span className="truncate text-[11px] text-muted-foreground">
            также <Marked text={`«${aka}»`} query={query} className="text-foreground/75" />
          </span>
        )}
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{facts.join(" · ")}</span>
          {anime.airing === "AIRING" && (
            <span className="inline-flex shrink-0 items-center gap-1 text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              онгоинг
            </span>
          )}
          {anime.hasCustomPlayer && <span className="shrink-0 text-primary/90">без рекламы</span>}
        </span>
      </span>
      {anime.score != null && anime.score > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums text-foreground/85">
          <StarIcon className="size-3 fill-amber-400 text-amber-400" />
          {anime.score.toFixed(1)}
        </span>
      )}
      <button
        type="button"
        aria-label={`Похожие на «${title}»`}
        title="Похожие"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onSimilar();
        }}
        className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[opacity,color,background-color] duration-200 hover:bg-primary/15 hover:text-primary sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-data-[selected=true]/row:opacity-100"
      >
        <ShapesIcon className="size-4" />
      </button>
    </CommandItem>
  );
}

/** The text with every word of the query that appears in it marked. */
function Marked({ text, query, className }: { text: string; query: string; className?: string }) {
  const parts = useMemo(() => {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    if (words.length === 0) return [text];
    const lower = text.toLowerCase();
    const marks: Array<[number, number]> = [];
    for (const word of words) {
      let from = 0;
      for (;;) {
        const at = lower.indexOf(word, from);
        if (at < 0) break;
        marks.push([at, at + word.length]);
        from = at + word.length;
      }
    }
    if (marks.length === 0) return [text];
    marks.sort((a, b) => a[0] - b[0]);
    const out: Array<string | { mark: string }> = [];
    let cursor = 0;
    for (const [start, end] of marks) {
      if (start < cursor) continue;
      if (start > cursor) out.push(text.slice(cursor, start));
      out.push({ mark: text.slice(start, end) });
      cursor = end;
    }
    if (cursor < text.length) out.push(text.slice(cursor));
    return out;
  }, [text, query]);
  return (
    <span className={cn("truncate", className)}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <mark key={i} className="rounded-[3px] bg-primary/25 px-0.5 text-foreground">
            {p.mark}
          </mark>
        ),
      )}
    </span>
  );
}

function Footer({ engine, onSubmit, onOpenAnime, max }: SearchPanelProps) {
  const t = useT();
  const result = engine.result!;
  const more = result.flat.length > max;
  const lucky = () => {
    const pool = result.flat.slice(0, 12);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) onOpenAnime(pick);
  };
  return (
    <div className="flex items-center gap-2 border-t border-border/50 p-2">
      <CommandItem
        value="see-all"
        onSelect={onSubmit}
        className="flex-1 justify-center rounded-lg bg-primary py-2 text-center text-sm font-semibold text-primary-foreground transition-[filter] duration-200 hover:brightness-110 data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:brightness-110"
      >
        <SearchIcon className="text-primary-foreground!" />
        <span className="truncate">
          {more ? t("search.seeMore", { query: engine.typed }) : t("search.seeAll", { query: engine.typed })}
        </span>
      </CommandItem>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={lucky}
        title="Мне повезёт — открыть случайный из найденного"
        className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <DicesIcon className="size-4 transition-transform duration-500 group-hover:rotate-[200deg]" />
        <span className="hidden sm:inline">Мне повезёт</span>
      </button>
    </div>
  );
}

function EmptyState({ engine }: { engine: SearchEngine }) {
  const other = engine.scope === "all" ? (["character", "plot"] as const) : (["all"] as const);
  return (
    <div className="relative isolate flex flex-col items-center gap-3 overflow-hidden px-6 py-10 text-center">
      <LogoWatermark className="left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 text-primary/[0.06]" />
      <p className="text-sm font-medium">
        {engine.working ? "Ищем…" : `По запросу «${engine.typed}» ничего не нашлось`}
      </p>
      {!engine.working && (
        <>
          <p className="max-w-xs text-xs text-muted-foreground">
            {engine.filters.size > 0
              ? "Снимите быстрые фильтры — или поищите в другом месте:"
              : "Проверьте написание или поищите в другом месте:"}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {other.map((scope) => (
              <button
                key={scope}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => engine.setScope(scope)}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {scope === "all" ? "Везде" : scope === "character" ? "Среди персонажей" : "В сюжете"}
              </button>
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => engine.setTerm(`похоже на ${engine.typed}`)}
              className="rounded-lg border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Похожее на «{engine.typed}»
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingRows({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex animate-in gap-3 duration-300 fade-in-0"
          style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
        >
          <Skeleton className={cn("rounded-lg", compact ? "h-12 w-[34px]" : "h-14 w-10")} />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">{children}</p>
      {aside}
    </div>
  );
}

const CHIP =
  "inline-flex animate-in items-center gap-1 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1 text-xs text-secondary-foreground transition-all duration-200 fade-in-0 zoom-in-95 hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground active:scale-95";

function IdleState({ engine, recent, onClearRecent, onOpenAnime }: SearchPanelProps) {
  const { data: trending } = useSearchTrending(true);
  const labels = useLabels();
  const fill = (q: string) => engine.setTerm(q);
  return (
    <div className="flex flex-col gap-4 p-3">
      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel
            aside={
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClearRecent}
                className="text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                Очистить
              </button>
            }
          >
            Недавнее
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((q, i) => (
              <button
                key={q}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fill(q)}
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
                className={CHIP}
              >
                <ClockIcon className="size-3 opacity-60" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {trending && trending.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>
            <span className="inline-flex items-center gap-1.5">
              <FlameIcon className="size-3.5 text-primary" />
              Сейчас смотрят
            </span>
          </SectionLabel>
          <div className="-mx-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {trending.map((anime, i) => (
              <button
                key={anime.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOpenAnime(anime)}
                style={{ animationDelay: `${i * 35}ms`, animationFillMode: "backwards" }}
                className="group flex w-[4.5rem] shrink-0 animate-in snap-start flex-col gap-1 text-left duration-300 fade-in-0 slide-in-from-right-2"
              >
                <span className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted ring-1 ring-white/5">
                  {anime.imageUrl && (
                    <img
                      src={imageSrc(anime.imageUrl)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold tabular-nums text-white">
                    {i + 1}
                  </span>
                </span>
                <span className="line-clamp-2 text-[11px] leading-tight text-foreground/85 group-hover:text-foreground">
                  {labels.title({ title: anime.title, titleLocalized: anime.titleLocalized, titleEnglish: null })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel>Умный поиск понимает</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {EXAMPLES.map(({ q, hint }, i) => (
            <button
              key={q}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fill(q)}
              style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
              className="group flex animate-in flex-col items-start gap-0.5 rounded-xl border border-border/50 bg-card/50 px-2.5 py-2 text-left duration-300 fade-in-0 slide-in-from-bottom-1 transition-colors hover:border-primary/40 hover:bg-primary/[0.06]"
            >
              <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">{q}</span>
              <span className="truncate text-[10.5px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Под настроение</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {MOOD_CHIPS.map((m, i) => (
            <button
              key={m.ru}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fill(m.ru)}
              style={{ animationDelay: `${i * 25}ms`, animationFillMode: "backwards" }}
              className={CHIP}
            >
              {m.ru}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
