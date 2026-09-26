import {
  COLLECTION_TAGS,
  type CollectionBlock,
  type CollectionCoverItem,
  type CollectionTag,
  MAX_COLLECTION_TAGS,
} from "@animeshadow/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  FilmIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CoverFlow } from "@/components/collections/cover-flow";
import { TagChip } from "@/components/collections/collection-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useCollection, useMyCollectionsStats, useSaveCollection, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";

/** A block with a key of its own, so reordering doesn't remount editors. */
type Draft = (CollectionBlock & { key: string });
interface AnimeCard {
  id: number;
  slug: string;
  title: string;
  image: string | null;
}

let seq = 0;
const nextKey = () => `b${++seq}`;

/**
 * The collection editor, for a new one (/collections/new) and an existing
 * one (/collections/:id/edit). The body is a list of blocks — paragraphs of
 * text and anime cards, each card with the author's note on why it's in —
 * added anywhere, moved up and down, removed. Beside it: the live cover,
 * the criteria, publish or keep as a draft, save.
 */
export function Component() {
  const { id } = useParams<{ id?: string }>();
  const { status } = useAuth();
  const existing = useCollection(id);

  if (status === "loading" || (id && existing.isPending)) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 py-6">
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }
  if (status !== "authenticated") return <Navigate to="/login" replace />;
  if (id && (!existing.data || !existing.data.canEdit)) return <Navigate to={`/collections/${id}`} replace />;

  const c = existing.data;
  return (
    <Editor
      key={id ?? "new"}
      id={id}
      initial={{
        title: c?.title ?? "",
        summary: c?.summary ?? "",
        tags: c?.tags ?? [],
        published: c?.published ?? true,
        blocks: (c?.blocks ?? [{ type: "text", text: "" } as CollectionBlock]).map((b) => ({ ...b, key: nextKey() })),
        anime: Object.fromEntries(
          Object.values(c?.anime ?? {}).map((a) => [a.id, { id: a.id, slug: a.slug, title: a.title, image: a.imageLargeUrl ?? a.imageUrl }]),
        ),
      }}
    />
  );
}

function Editor({
  id,
  initial,
}: {
  id?: string;
  initial: {
    title: string;
    summary: string;
    tags: CollectionTag[];
    published: boolean;
    blocks: Draft[];
    anime: Record<number, AnimeCard>;
  };
}) {
  const t = useT();
  const navigate = useNavigate();
  const save = useSaveCollection();
  const { data: mine } = useMyCollectionsStats(!id);
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [tags, setTags] = useState<CollectionTag[]>(initial.tags);
  const [published, setPublished] = useState(initial.published);
  const [blocks, setBlocks] = useState<Draft[]>(initial.blocks);
  const [anime, setAnime] = useState<Record<number, AnimeCard>>(initial.anime);

  const limit = mine?.limit;
  const atLimit = !id && limit?.max != null && limit.used >= limit.max;

  const update = (key: string, patch: Partial<CollectionBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.key === key ? ({ ...b, ...patch } as Draft) : b)));
  const move = (key: string, dir: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const removeBlock = (key: string) => setBlocks((bs) => bs.filter((b) => b.key !== key));
  const insertAt = (index: number, block: CollectionBlock) =>
    setBlocks((bs) => [...bs.slice(0, index), { ...block, key: nextKey() } as Draft, ...bs.slice(index)]);

  const addAnime = (index: number, a: AnimeCard) => {
    if (blocks.some((b) => b.type === "anime" && b.animeId === a.id)) {
      toast.error(t("collections.editor.duplicate"));
      return;
    }
    setAnime((m) => ({ ...m, [a.id]: a }));
    insertAt(index, { type: "anime", animeId: a.id, note: "" });
  };

  const cover: CollectionCoverItem[] = blocks
    .flatMap((b) => (b.type === "anime" && anime[b.animeId] ? [anime[b.animeId]!] : []))
    .slice(0, 7)
    .map((a) => ({ id: a.id, slug: a.slug, title: a.title, image: a.image, banner: null }));
  const animeCount = blocks.filter((b) => b.type === "anime").length;

  const submit = () => {
    const clean = blocks
      .map(({ key: _k, ...b }) => b as CollectionBlock)
      .filter((b) => b.type === "anime" || b.text.trim().length > 0);
    save.mutate(
      { id, input: { title: title.trim(), summary: summary.trim(), tags, published, blocks: clean } },
      {
        onSuccess: (saved) => {
          toast.success(t("collections.editor.saved"));
          navigate(`/collections/${saved.id}`, { replace: true });
        },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : t("errors.genericTitle")),
      },
    );
  };
  const canSave = title.trim().length >= 3 && animeCount > 0 && !save.isPending && !atLimit;

  return (
    <div className="mx-auto grid max-w-6xl gap-5 py-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={t("collections.editor.titlePh")}
          className="w-full bg-transparent font-display text-3xl leading-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
        />
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={400}
          rows={2}
          placeholder={t("collections.editor.summaryPh")}
          className="w-full resize-none bg-transparent text-lg leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50"
        />

        <div className="flex flex-col gap-2">
          <Inserter onText={() => insertAt(0, { type: "text", text: "" })} onAnime={(a) => addAnime(0, a)} />
          {blocks.map((block, i) => (
            <div key={block.key} className="flex flex-col gap-2">
              <BlockEditor
                block={block}
                anime={block.type === "anime" ? anime[block.animeId] : undefined}
                first={i === 0}
                last={i === blocks.length - 1}
                onChange={(patch) => update(block.key, patch)}
                onMove={(dir) => move(block.key, dir)}
                onRemove={() => removeBlock(block.key)}
              />
              <Inserter onText={() => insertAt(i + 1, { type: "text", text: "" })} onAnime={(a) => addAnime(i + 1, a)} />
            </div>
          ))}
        </div>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)]">
          {cover.length > 0 ? (
            <CoverFlow items={cover} size="sm" />
          ) : (
            <p className="grid h-44 place-items-center p-4 text-center text-xs text-muted-foreground">{t("collections.editor.coverHint")}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3.5">
          <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("collections.editor.criteria")}
            <span className="tabular-nums normal-case">
              {tags.length}/{MAX_COLLECTION_TAGS}
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {COLLECTION_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <TagChip
                  key={tag}
                  tag={tag}
                  active={on}
                  onClick={() =>
                    setTags((ts) => (on ? ts.filter((x) => x !== tag) : ts.length >= MAX_COLLECTION_TAGS ? ts : [...ts, tag]))
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3.5">
          <button
            type="button"
            onClick={() => setPublished((p) => !p)}
            className="flex items-center gap-2 rounded-lg border border-primary/25 bg-card/60 px-3 py-2 text-left text-sm transition-colors hover:border-primary"
          >
            {published ? <EyeIcon className="size-4 text-primary" /> : <EyeOffIcon className="size-4 text-muted-foreground" />}
            <span className="flex-1">
              <span className="block font-semibold">{published ? t("collections.editor.public") : t("collections.editor.draft")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {published ? t("collections.editor.publicHint") : t("collections.editor.draftHint")}
              </span>
            </span>
          </button>
          <p className="text-xs text-muted-foreground">{t("collections.editor.counts", { n: animeCount })}</p>
          {atLimit && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
              {t("collections.editor.limit", { max: limit!.max! })}{" "}
              <Link to="/support" className="font-semibold underline">
                PRO
              </Link>
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            className="btn-sheen inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-50"
          >
            {save.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            {id ? t("collections.editor.update") : t("collections.editor.publish")}
          </button>
          {!canSave && !save.isPending && !atLimit && (
            <p className="text-[11px] text-muted-foreground">{t("collections.editor.needs")}</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function BlockEditor({
  block,
  anime,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  block: Draft;
  anime: AnimeCard | undefined;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<CollectionBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const controls = (
    <div className="flex shrink-0 flex-col gap-1">
      <IconBtn label="↑" disabled={first} onClick={() => onMove(-1)} icon={ArrowUpIcon} />
      <IconBtn label="↓" disabled={last} onClick={() => onMove(1)} icon={ArrowDownIcon} />
      <IconBtn label={t("common.delete")} onClick={onRemove} icon={Trash2Icon} danger />
    </div>
  );

  if (block.type === "text") {
    return (
      <div className="flex gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-card/40 p-2.5">
        <AutoTextarea
          value={block.text}
          onChange={(text) => onChange({ text })}
          maxLength={4000}
          placeholder={t("collections.editor.textPh")}
          className="min-h-20 flex-1 text-[15px] leading-relaxed"
        />
        {controls}
      </div>
    );
  }
  return (
    <div className="flex gap-3 rounded-2xl border border-primary/30 bg-[var(--accent-surface)] p-2.5">
      <span className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-24">
        {anime?.image && <img src={imageSrc(anime.image)} alt="" className="size-full object-cover" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="line-clamp-2 font-display text-base leading-tight">{anime?.title ?? `#${block.animeId}`}</span>
        <AutoTextarea
          value={block.note}
          onChange={(note) => onChange({ note })}
          maxLength={1500}
          placeholder={t("collections.editor.notePh")}
          className="min-h-16 flex-1 rounded-lg border border-primary/20 bg-card/60 p-2 text-sm"
        />
      </div>
      {controls}
    </div>
  );
}

function IconBtn({
  label,
  icon: Icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: typeof ArrowUpIcon;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-md border transition-colors disabled:opacity-30",
        danger
          ? "border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
          : "border-primary/25 text-muted-foreground hover:border-primary hover:text-primary",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

/** A textarea that grows with what's typed into it. */
function AutoTextarea({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className={cn("w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/60", className)}
      {...rest}
    />
  );
}

/** "+ text" / "+ anime" between blocks; the anime button opens a search. */
function Inserter({ onText, onAnime }: { onText: () => void; onAnime: (a: AnimeCard) => void }) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="group flex items-center gap-2">
        <span className="h-px flex-1 bg-[var(--accent-line-soft)]" />
        <button
          type="button"
          onClick={onText}
          className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-card/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <TextIcon className="size-3" />
          {t("collections.editor.addText")}
        </button>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-pressed={picking}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
            picking ? "border-primary bg-primary text-primary-foreground" : "border-primary/25 bg-card/60 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <FilmIcon className="size-3" />
          {t("collections.editor.addAnime")}
        </button>
        <span className="h-px flex-1 bg-[var(--accent-line-soft)]" />
      </div>
      {picking && (
        <AnimePicker
          onPick={(a) => {
            onAnime(a);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function AnimePicker({ onPick }: { onPick: (a: AnimeCard) => void }) {
  const t = useT();
  const labels = useLabels();
  const [q, setQ] = useState("");
  const term = useDebouncedValue(q.trim(), 250);
  const search = useSmartSearch(term, term.length >= 2);
  const results = (search.data?.flat ?? []).slice(0, 8);
  return (
    <div className="flex animate-in flex-col gap-2 rounded-xl border border-primary/40 bg-card p-2.5 fade-in-0 slide-in-from-top-1 duration-200">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("collections.editor.searchAnime")}
          className="h-9 w-full rounded-lg border border-primary/25 bg-background/80 pl-8 pr-8 text-sm outline-none focus:border-primary"
        />
        {search.isFetching && <Loader2Icon className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />}
      </div>
      {results.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick({ id: a.id, slug: a.slug, title: labels.title(a), image: a.imageLargeUrl ?? a.imageUrl })}
                className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-primary/10"
              >
                <span className="h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
                  {a.imageUrl && <img src={imageSrc(a.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-medium">{labels.title(a)}</span>
                  <span className="text-[10px] text-muted-foreground">{labels.seasonYearLabel(a)}</span>
                </span>
                <PlusIcon className="size-4 text-primary" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.length >= 2 && !search.isFetching && results.length === 0 && (
        <p className="p-2 text-xs text-muted-foreground">{t("search.noMatches")}</p>
      )}
    </div>
  );
}
