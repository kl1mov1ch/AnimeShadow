import type { AnimeSummary, ParsedSearch, SearchGroup, SearchScope, SmartSearchResponse } from "@animeshadow/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSmartSearch } from "@/lib/query";

/** One-tap narrowing of what came back — done here, no new request. */
export type QuickFilter = "tv" | "movie" | "airing" | "own" | "top";

export const QUICK_FILTERS: Array<{ key: QuickFilter; label: string; test: (a: AnimeSummary) => boolean }> = [
  { key: "tv", label: "Сериалы", test: (a) => a.type === "TV" || a.type === "ONA" },
  { key: "movie", label: "Фильмы", test: (a) => a.type === "MOVIE" },
  { key: "airing", label: "Онгоинги", test: (a) => a.airing === "AIRING" },
  { key: "own", label: "Без рекламы", test: (a) => a.hasCustomPlayer === true },
  { key: "top", label: "Оценка 8+", test: (a) => (a.score ?? 0) >= 8 },
];

/** Where to look: everything, or one lens (asked of the server by name). */
export const SCOPES: Array<{ key: SearchScope; label: string }> = [
  { key: "all", label: "Всё" },
  { key: "title", label: "Названия" },
  { key: "character", label: "Персонажи" },
  { key: "studio", label: "Студии" },
  { key: "plot", label: "Сюжет" },
];

export function hasParsedFilters(parsed: ParsedSearch | undefined): boolean {
  return Boolean(parsed && (parsed.yearFrom != null || parsed.type || parsed.airing));
}

/** The catalogue with the filters a query was read as. */
export function catalogHrefFor(parsed: ParsedSearch): string {
  const params = new URLSearchParams();
  if (parsed.type) params.set("type", parsed.type);
  if (parsed.airing) params.set("airing", parsed.airing);
  if (parsed.yearFrom != null) params.set("yearFrom", String(parsed.yearFrom));
  if (parsed.yearTo != null) params.set("yearTo", String(parsed.yearTo));
  if (parsed.rest) params.set("q", parsed.rest);
  return `/browse?${params.toString()}`;
}

function narrow(result: SmartSearchResponse, filters: ReadonlySet<QuickFilter>): SmartSearchResponse {
  if (filters.size === 0) return result;
  const tests = QUICK_FILTERS.filter((f) => filters.has(f.key)).map((f) => f.test);
  const keep = (a: AnimeSummary) => tests.every((test) => test(a));
  const groups: SearchGroup[] = result.groups
    .map((g) => ({ ...g, items: g.items.filter(keep) }))
    .filter((g) => g.items.length > 0);
  const flat = result.flat.filter(keep);
  return { ...result, groups, flat, total: flat.length };
}

/**
 * Everything a search surface needs, shared by the header's dropdown and the
 * search window: the term, where to look, the quick filters, and the answer.
 *
 * Light on the server by design. As someone types, only the quick request
 * runs (titles, every name a title goes by, filters read from the words) —
 * debounced, cached a minute, and the previous answer stays on screen until
 * the next one lands, so nothing blinks. The thorough one (characters,
 * studios, plot) runs only when they stop typing and the quick one found
 * little, or when a lens is picked by name.
 */
export function useSearchEngine(active: boolean) {
  const [term, setTerm] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [filters, setFilters] = useState<ReadonlySet<QuickFilter>>(() => new Set());
  const typed = term.trim();
  const debounced = useDebouncedValue(typed, 180);
  const settled = useDebouncedValue(typed, 650);

  const quick = useSmartSearch(debounced, active && scope === "all", true, "all");
  const thin =
    scope === "all" &&
    quick.data != null &&
    quick.data.query === settled &&
    quick.data.flat.length < 4 &&
    !quick.data.parsed?.similarTo &&
    !hasParsedFilters(quick.data.parsed);
  const deep = useSmartSearch(
    scope === "all" ? settled : debounced,
    active && (scope !== "all" || (thin && settled.length >= 3)),
    false,
    scope,
  );

  const raw = useMemo((): SmartSearchResponse | undefined => {
    if (scope !== "all") return deep.data;
    const q = quick.data;
    const d = deep.data;
    if (q && d && d.query === q.query && d.flat.length > q.flat.length) return d;
    return q;
  }, [scope, quick.data, deep.data]);

  const result = useMemo(() => (raw ? narrow(raw, filters) : undefined), [raw, filters]);
  const showResults = typed.length >= 2;
  // Still catching up with what is typed: the old answer stays, a thin line
  // runs at the top.
  const working =
    showResults && (raw?.query !== typed || quick.isFetching || (deep.isFetching && (scope !== "all" || thin)));

  const toggleFilter = useCallback((key: QuickFilter) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        // Two formats at once would always be empty.
        if (key === "tv") next.delete("movie");
        if (key === "movie") next.delete("tv");
        next.add(key);
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setTerm("");
    setScope("all");
    setFilters(new Set());
  }, []);

  return {
    term,
    setTerm,
    typed,
    scope,
    setScope,
    filters,
    toggleFilter,
    result,
    /** The answer before the quick filters, for their counts. */
    raw,
    showResults,
    working,
    loading: showResults && !raw && (quick.isFetching || deep.isFetching || debounced !== typed),
    reset,
  };
}

export type SearchEngine = ReturnType<typeof useSearchEngine>;

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Search by voice, where the browser can listen (Chrome, Android, Safari):
 * the words appear in the field as they are heard. Nothing is recorded by
 * the site — the browser's own speech recognition does the listening.
 */
export function useVoiceSearch(onText: (text: string) => void, lang = "ru-RU") {
  const [supported] = useState(() => recognizerCtor() != null);
  const [listening, setListening] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  useEffect(() => () => recognizer.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognizerCtor();
    if (!Ctor || recognizer.current) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript;
      if (text) onTextRef.current(text.replace(/[.!?]+$/, "").trim());
    };
    const done = () => {
      recognizer.current = null;
      setListening(false);
    };
    rec.onend = done;
    rec.onerror = done;
    try {
      rec.start();
      recognizer.current = rec;
      setListening(true);
    } catch {
      done();
    }
  }, [lang]);

  const stop = useCallback(() => recognizer.current?.stop(), []);
  return { supported, listening, start, stop };
}
