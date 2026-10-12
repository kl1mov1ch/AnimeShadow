import type { PublicProfile } from "@animeshadow/shared";
import { ListIcon, SearchIcon, StarIcon, XIcon } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { type PublicListEntry, useUserList } from "@/lib/query";
import { cn } from "@/lib/utils";
import { STATUS_COLOR, STATUS_ORDER, type ListStatus } from "./format";
import { EmptyNote, LockedNote, Pills } from "./kit";

type Sort = "updated" | "score" | "title";
const PAGE = 48;

/**
 * Their anime list: by status (with how many in each), a search inside it,
 * an order (latest first, by their score, by name). Posters with the score
 * they gave, how far they got and a stripe in the status's colour. Long
 * lists show 48 at a time.
 */
export function ListTab({
  profile,
  status,
  onStatus,
}: {
  profile: PublicProfile;
  status: ListStatus | "ALL";
  onStatus: (status: ListStatus | "ALL") => void;
}) {
  const t = useT();
  const labels = useLabels();
  const { data, isPending } = useUserList(profile.id, !profile.hidden.list);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  const counts = useMemo(() => {
    const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ListStatus, number>;
    for (const e of data ?? []) if (e.status in out) out[e.status as ListStatus] += 1;
    return out;
  }, [data]);

  const items = useMemo(() => {
    let list = (data ?? []).filter((e) => status === "ALL" || e.status === status);
    if (q) {
      list = list.filter((e) =>
        [e.anime.title, e.anime.titleLocalized, e.anime.titleEnglish].some((n) => n?.toLowerCase().includes(q)),
      );
    }
    const byTitle = (a: PublicListEntry, b: PublicListEntry) => labels.title(a.anime).localeCompare(labels.title(b.anime), "ru");
    return [...list].sort((a, b) =>
      sort === "score"
        ? (b.score ?? -1) - (a.score ?? -1) || byTitle(a, b)
        : sort === "title"
          ? byTitle(a, b)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [data, status, q, sort, labels]);

  if (profile.hidden.list) return <LockedNote what="Список" />;

  const options: Array<{ value: ListStatus | "ALL"; label: string; count?: number }> = [
    { value: "ALL", label: "Все", count: data?.length ?? 0 },
    ...STATUS_ORDER.map((s) => ({ value: s, label: t(`status.${s}` as "status.WATCHING"), count: counts[s] })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Pills
          value={status}
          options={options}
          onPick={(v) => {
            onStatus(v);
            setLimit(PAGE);
          }}
          className="lg:flex-1"
        />
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1 lg:w-60 lg:flex-none">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти в списке"
              className="h-9 w-full rounded-full border border-[var(--accent-line-soft)] bg-background/50 pl-9 pr-8 text-sm outline-none transition-colors focus:border-primary/50"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Очистить" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground">
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Порядок"
            className="h-9 rounded-full border border-[var(--accent-line-soft)] bg-background/50 px-3 text-sm outline-none focus:border-primary/50"
          >
            <option value="updated">Сначала новые</option>
            <option value="score">По оценке</option>
            <option value="title">По названию</option>
          </select>
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-foreground/[0.05]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote icon={ListIcon} title={q ? "Ничего не нашлось" : "Здесь пока пусто"} hint={q ? "Попробуйте другое название." : undefined} />
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {items.slice(0, limit).map((entry, i) => (
              <ListCard key={entry.anime.id} entry={entry} index={i} />
            ))}
          </ul>
          {items.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="mx-auto h-10 rounded-full border border-[var(--accent-line-soft)] px-6 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              Показать ещё {Math.min(PAGE, items.length - limit)} из {items.length - limit}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ListCard({ entry, index }: { entry: PublicListEntry; index: number }) {
  const t = useT();
  const labels = useLabels();
  const { anime, status, score, progress } = entry;
  const total = anime.episodes;
  const color = STATUS_COLOR[status as ListStatus] ?? "#94a3b8";
  return (
    <li
      className="animate-in fade-in-0"
      style={{ animationDelay: `${Math.min(index, 16) * 25}ms`, animationFillMode: "backwards" }}
    >
      <Link to={animeHref(anime)} viewTransition className="group block">
        <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-white/5 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-black/40">
          {anime.imageUrl && (
            <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          {score != null && score > 0 && (
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              <StarIcon className="size-3 fill-amber-400 text-amber-400" />
              {score}
            </span>
          )}
          <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1 text-[10px] font-medium text-white/90">
            <span className="truncate" title={t(`status.${status}` as "status.WATCHING")}>
              {t(`status.${status}` as "status.WATCHING")}
            </span>
            {anime.type !== "MOVIE" && (progress > 0 || total) && (
              <span className="shrink-0 tabular-nums">
                {progress}
                {total ? `/${total}` : ""}
              </span>
            )}
          </span>
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: color }} />
        </span>
        <span className={cn("mt-1.5 line-clamp-2 block text-xs font-medium leading-snug transition-colors group-hover:text-primary")}>
          {labels.title(anime)}
        </span>
      </Link>
    </li>
  );
}
