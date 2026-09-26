import type { CollectionSummary, CollectionTag } from "@animeshadow/shared";
import { EyeIcon, LayersIcon, LockIcon, MessageSquareIcon, StarIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ProMark } from "@/components/common/pro-mark";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TagChip({
  tag,
  active,
  onClick,
  className,
}: {
  tag: CollectionTag;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const t = useT();
  const cls = cn(
    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-primary/10 text-primary",
    onClick && !active && "hover:border-primary hover:bg-primary/20",
    className,
  );
  const label = t(`collections.tags.${tag}` as "collections.tags.cozy");
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={cls}>
      {label}
    </button>
  ) : (
    <span className={cls}>{label}</span>
  );
}

export function RatingBadge({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      <StarIcon className={cn("size-3.5", avg != null ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      {avg != null ? avg.toFixed(1) : "—"}
      {count > 0 && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}

/**
 * A collection in a list: its first posters fanned like a hand of cards,
 * the title and lead, who made it and how it's doing.
 */
export function CollectionCard({ collection, className }: { collection: CollectionSummary; className?: string }) {
  const t = useT();
  const fan = collection.cover.slice(0, 3);
  return (
    <Link
      to={`/collections/${collection.id}`}
      viewTransition
      className={cn(
        "group flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
        className,
      )}
    >
      <div className="relative h-40 overflow-hidden rounded-xl bg-card">
        {collection.cover[0]?.image && (
          <img
            aria-hidden
            src={imageSrc(collection.cover[0].image)}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full scale-125 object-cover opacity-25 blur-xl"
          />
        )}
        {fan.map((item, i) => {
          const offset = i - (fan.length - 1) / 2;
          return (
            <span
              key={item.id}
              className="absolute bottom-3 left-1/2 aspect-[2/3] w-20 overflow-hidden rounded-lg border border-white/15 bg-muted shadow-xl transition-transform duration-500 group-hover:-translate-y-1"
              style={{
                transform: `translateX(calc(-50% + ${offset * 58}%)) rotate(${offset * 8}deg)`,
                zIndex: 10 - Math.abs(offset),
              }}
            >
              {item.image && <img src={imageSrc(item.image)} alt="" loading="lazy" className="size-full object-cover" />}
            </span>
          );
        })}
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <LayersIcon className="size-3" />
          {collection.animeCount}
        </span>
        {!collection.published && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            <LockIcon className="size-3" />
            {t("collections.draft")}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="line-clamp-2 font-display text-base leading-tight transition-colors group-hover:text-primary">
          {collection.title}
        </h3>
        {collection.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{collection.summary}</p>}
        {collection.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {collection.tags.slice(0, 3).map((tag) => (
              <TagChip key={tag} tag={tag} className="text-[10px]" />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--accent-line-soft)] pt-2 text-[11px]">
        <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {collection.author.avatarUrl ? (
            <img src={imageSrc(collection.author.avatarUrl)} alt="" className="size-full object-cover" />
          ) : (
            collection.author.displayName.charAt(0).toUpperCase()
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1 truncate font-medium">
          <span className="truncate">{collection.author.displayName}</span>
          {collection.author.isPro && <ProMark className="text-xs" />}
        </span>
        <RatingBadge avg={collection.ratingAvg} count={0} />
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <EyeIcon className="size-3" />
          {collection.viewCount}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <MessageSquareIcon className="size-3" />
          {collection.commentCount}
        </span>
      </div>
    </Link>
  );
}
