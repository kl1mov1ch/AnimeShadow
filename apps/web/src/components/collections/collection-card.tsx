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
 * A collection in a list, as a small poster of its own: the first title's
 * banner as the backdrop, the collection's posters fanned on top — they
 * spread apart under the pointer — and the title over the art. `featured`
 * makes it wide and tall, for the top of the feed; `rank` draws its place.
 */
export function CollectionCard({
  collection,
  featured = false,
  rank,
  className,
  style,
}: {
  collection: CollectionSummary;
  featured?: boolean;
  rank?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const fan = collection.cover.slice(0, featured ? 5 : 4);
  const backdrop = collection.cover.find((c) => c.banner)?.banner ?? collection.cover[0]?.image ?? null;
  const isBanner = Boolean(collection.cover.find((c) => c.banner));
  const mid = (fan.length - 1) / 2;

  return (
    <Link
      to={`/collections/${collection.id}`}
      viewTransition
      style={style}
      className={cn(
        "group/cc relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-card shadow-lg shadow-black/20 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/45 hover:shadow-xl hover:shadow-primary/10",
        featured ? "min-h-[22rem] sm:min-h-[24rem]" : "min-h-[20rem]",
        className,
      )}
    >
      {/* Backdrop: a banner when the anime has one, else the poster, blurred. */}
      {backdrop && (
        <img
          aria-hidden
          src={imageSrc(backdrop)}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 -z-20 size-full object-cover transition-transform duration-700 group-hover/cc:scale-105",
            isBanner ? "opacity-45" : "scale-125 opacity-30 blur-xl",
          )}
        />
      )}
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/80 to-card/10" />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_70%_at_100%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_60%)] opacity-0 transition-opacity duration-500 group-hover/cc:opacity-100" />

      {/* The posters, fanned; under the pointer they open up. */}
      <div className={cn("relative mx-3 mt-3 flex-1", featured ? "min-h-52" : "min-h-40")}>
        {fan.map((item, i) => {
          const offset = i - mid;
          return (
            <span
              key={item.id}
              className={cn(
                "cc-fan absolute bottom-0 left-1/2 aspect-[2/3] overflow-hidden rounded-lg border border-white/15 bg-muted shadow-xl shadow-black/50",
                featured ? "w-28 sm:w-32" : "w-[5.5rem]",
              )}
              style={
                {
                  "--x": `${offset * 52}%`,
                  "--x-open": `${offset * 78}%`,
                  "--r": `${offset * 7}deg`,
                  "--r-open": `${offset * 11}deg`,
                  "--y": `${Math.abs(offset) * 6}px`,
                  zIndex: 10 - Math.round(Math.abs(offset) * 2),
                } as React.CSSProperties
              }
            >
              {item.image && <img src={imageSrc(item.image)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
            </span>
          );
        })}
      </div>

      {/* Corner tags. */}
      <span className="absolute right-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">
        <LayersIcon className="size-3" />
        {collection.animeCount}
      </span>
      {!collection.published && (
        <span className="absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          <LockIcon className="size-3" />
          {t("collections.draft")}
        </span>
      )}
      {rank != null && collection.published && (
        <span
          aria-hidden
          className="cc-rank pointer-events-none absolute left-3 top-1 z-20 font-display text-5xl leading-none"
        >
          {rank}
        </span>
      )}

      {/* Title, lead, tags, then who and how it's doing. */}
      <div className="relative z-20 flex flex-col gap-1.5 px-3.5 pb-3 pt-3">
        <h3 className={cn("line-clamp-2 font-display leading-tight transition-colors group-hover/cc:text-primary", featured ? "text-xl sm:text-2xl" : "text-base")}>
          {collection.title}
        </h3>
        {collection.summary && (
          <p className={cn("text-xs text-muted-foreground", featured ? "line-clamp-3 sm:text-sm" : "line-clamp-2")}>{collection.summary}</p>
        )}
        {collection.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {collection.tags.slice(0, featured ? 5 : 3).map((tag) => (
              <TagChip key={tag} tag={tag} className="text-[10px]" />
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 border-t border-white/[0.07] pt-2 text-[11px]">
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
      </div>
    </Link>
  );
}
