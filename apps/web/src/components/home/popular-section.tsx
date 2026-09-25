import type { AnimeSummary } from "@animeshadow/shared";
import { FlameIcon, PlayIcon, SparklesIcon, StarIcon, TrendingUpIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { animeHref, imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlyphWatermark, HomeContainer, Reveal, SectionHeading, Shine } from "./home-ui";

/** The three shelves the section can show, and what each is called. */
const TABS = [
  { key: "trending", label: "Сейчас смотрят", icon: FlameIcon, note: "Что включают прямо сейчас наши зрители" },
  { key: "season", label: "Этот сезон", icon: SparklesIcon, note: "Свежие тайтлы текущего сезона" },
  { key: "top", label: "Легенды", icon: TrendingUpIcon, note: "Те, что смотрят годами и пересматривают" },
] as const;

export type PopularTab = (typeof TABS)[number]["key"];

/** Only the two tags worth shouting: it is new, or it is a hit. */
function badgeFor(anime: AnimeSummary): string | null {
  if (anime.airing === "AIRING") return "Новинка";
  if ((anime.score ?? 0) >= 8.5) return "Хит";
  return null;
}

function ageLabel(rating: string | null): string {
  if (!rating) return "16+";
  if (rating.startsWith("G")) return "0+";
  if (rating.startsWith("PG-13")) return "12+";
  if (rating.startsWith("PG")) return "6+";
  if (rating.startsWith("R+")) return "18+";
  if (rating.startsWith("R")) return "16+";
  return "16+";
}

/**
 * Five titles across on a desktop, a swipeable strip on a phone. The card
 * is the poster: name and numbers sit over it, and hovering lifts it,
 * brightens the art and slides genres and a play button up from the bottom
 * — a little at rest, a lot when you look at it.
 */
export function PopularSection({ shelves }: { shelves: Record<PopularTab, AnimeSummary[]> }) {
  const available = TABS.filter((tab) => (shelves[tab.key]?.length ?? 0) > 0);
  const [active, setActive] = useState<PopularTab>(available[0]?.key ?? "trending");
  const current = available.find((tab) => tab.key === active) ?? available[0];
  const items = current ? (shelves[current.key] ?? []) : [];
  if (items.length === 0 || !current) return null;
  return (
    <section className="relative overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg)] py-12">
      <GlyphWatermark className="-right-12 top-2 text-[15rem] leading-none" />
      <HomeContainer className="relative">
        <Reveal>
          <SectionHeading
            label="Популярное"
            title="Популярное"
            subtitle={current.note}
            action={{ to: "/browse?orderBy=members&sort=desc", label: "Смотреть весь каталог →" }}
          />
        </Reveal>

        {/* Three shelves, one row: the section answers "а что ещё?" without
            going anywhere. */}
        {available.length > 1 && (
          <Reveal>
            <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {available.map((tab) => {
                const on = tab.key === current.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActive(tab.key)}
                    className={cn(
                      "group/btn relative isolate inline-flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-lg border px-3.5 text-sm transition-all duration-300",
                      on
                        ? "border-[var(--hm-accent)] bg-[var(--hm-accent)] font-medium text-white"
                        : "border-[var(--hm-border)] bg-[var(--hm-card)] text-[var(--hm-muted)] hover:-translate-y-0.5 hover:border-[var(--hm-accent)]/60 hover:text-[var(--hm-text)]",
                    )}
                  >
                    <tab.icon className="relative z-10 size-4" />
                    <span className="relative z-10">{tab.label}</span>
                    <Shine />
                  </button>
                );
              })}
              <span className="ml-auto hidden shrink-0 items-center text-xs text-[var(--hm-muted)] sm:flex">
                {items.length} тайтлов в подборке
              </span>
            </div>
          </Reveal>
        )}
        <ul
          key={current.key}
          className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-5 lg:overflow-visible"
        >
          {items.slice(0, 5).map((anime, i) => (
            <li
              key={anime.id}
              className="animate-in fade-in slide-in-from-bottom-3 w-[58vw] shrink-0 snap-start duration-500 sm:w-[38vw] md:w-[28vw] lg:w-auto"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "both" }}
            >
              <PopularCard anime={anime} rank={i + 1} />
            </li>
          ))}
        </ul>
      </HomeContainer>
    </section>
  );
}

function PopularCard({ anime, rank }: { anime: AnimeSummary; rank: number }) {
  const badge = badgeFor(anime);
  const title = anime.titleLocalized ?? anime.title;
  const art = imageSrc(anime.imageLargeUrl ?? anime.imageUrl);

  return (
    <Link
      to={animeHref(anime)}
      className="group group/card relative block aspect-[3/4.35] overflow-hidden rounded-2xl border border-[var(--hm-border)] bg-[var(--hm-card)] transition-all duration-500 hover:-translate-y-2 hover:border-[var(--hm-accent)]/60 hover:shadow-[0_24px_60px_-28px_var(--hm-shadow)]"
    >
      {art ? (
        <img
          src={art}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-all duration-700 group-hover:scale-[1.08] group-hover:saturate-150"
          style={{ filter: "brightness(var(--hm-art-brightness))" }}
        />
      ) : (
        <span className="absolute inset-0 bg-[var(--hm-card-alt)]" />
      )}

      {/* The wash that carries the text; it deepens on hover so what slides
          up from below stays readable. */}
      <span
        aria-hidden
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background:
            "linear-gradient(to top, var(--hm-bg) 4%, color-mix(in srgb, var(--hm-bg) 72%, transparent) 34%, transparent 68%)",
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(to top, var(--hm-bg) 22%, color-mix(in srgb, var(--hm-bg) 70%, transparent) 62%, color-mix(in srgb, var(--hm-accent) 20%, transparent) 100%)",
        }}
      />

      {/* The shelf position, drawn big and faint in the corner. */}
      <span
        aria-hidden
        className="home-display pointer-events-none absolute -bottom-3 right-2 text-[5rem] leading-none text-[var(--hm-text)]/10 transition-all duration-500 group-hover:text-[var(--hm-accent)]/30"
      >
        {rank}
      </span>
      <Shine className="z-20" />

      <span className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--hm-bg)]/70 px-2 py-1 text-[11px] font-semibold text-[var(--hm-text)]">
          <StarIcon className="size-3 fill-[var(--hm-accent)] text-[var(--hm-accent)]" />
          <span className="tabular-nums">{anime.score != null ? anime.score.toFixed(1) : "—"}</span>
        </span>
        {badge && (
          <span className="rounded-lg bg-[var(--hm-accent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            {badge}
          </span>
        )}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3.5">
        <span className="home-display line-clamp-2 text-[15px] leading-tight text-[var(--hm-text)] transition-colors duration-300 group-hover:text-[var(--hm-accent)]">
          {title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--hm-muted)]">
          <span>{ageLabel(anime.rating)}</span>
          <span className="size-1 rounded-full bg-[var(--hm-muted)]/50" />
          <span className="tabular-nums">{anime.episodes ? `${anime.episodes} серий` : "—"}</span>
          {anime.year && (
            <>
              <span className="size-1 rounded-full bg-[var(--hm-muted)]/50" />
              <span className="tabular-nums">{anime.year}</span>
            </>
          )}
        </span>

        {/* Zero height until hover — the card itself never changes size. */}
        <span className="grid grid-rows-[0fr] opacity-0 transition-all duration-500 group-hover:grid-rows-[1fr] group-hover:opacity-100">
          <span className="overflow-hidden">
            <span className="mt-1 block truncate text-[11px] text-[var(--hm-muted)]">
              {anime.genres.slice(0, 3).join(" · ")}
            </span>
            <span className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[var(--hm-accent)] text-xs font-semibold text-white">
              <PlayIcon className="size-3.5 fill-current" />
              Смотреть
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
