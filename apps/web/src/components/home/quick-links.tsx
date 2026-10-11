import type { AnimeSummary } from "@animeshadow/shared";
import { landingPath, seasonNameRu, seasonOf } from "@animeshadow/shared";
import {
  CalendarClockIcon,
  CalendarIcon,
  ClapperboardIcon,
  DicesIcon,
  LayersIcon,
  type LucideIcon,
  MonitorPlayIcon,
  RadioIcon,
  TrophyIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { titlesCount } from "@/lib/curated";
import { imageSrc } from "@/lib/format";
import { useCuratedCollections } from "@/lib/query";
import { cn } from "@/lib/utils";

interface QuickLink {
  to: string;
  /** The tile's name — short, it is all a phone shows. */
  title: string;
  hint: string;
  Icon: LucideIcon;
  /** The themed collection whose posters and count the tile shows. */
  curated?: string;
}

/**
 * One tile, the same for every link (the dice included): on a phone an icon
 * over a one-word name, four to a row; from a tablet up the icon beside the
 * name and what is in it.
 */
const TILE =
  "group relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-1 text-center outline-none transition-transform duration-200 active:scale-95 sm:flex-row sm:gap-2.5 sm:overflow-hidden sm:rounded-xl sm:border sm:border-border/60 sm:bg-card/50 sm:p-2.5 sm:text-left sm:transition-[border-color,background-color,transform] sm:hover:-translate-y-0.5 sm:hover:border-foreground/20 sm:hover:bg-card focus-visible:ring-2 focus-visible:ring-ring";
const CHIP =
  "relative z-10 grid size-12 shrink-0 place-items-center rounded-2xl border border-border/60 bg-card/70 text-foreground/80 transition-colors duration-300 group-hover:border-primary/40 group-hover:text-primary group-active:border-primary/50 group-active:text-primary sm:size-9 sm:rounded-lg sm:border-0 sm:bg-foreground/[0.07] sm:group-hover:bg-primary/15";

/**
 * Right under the hero: the lists people come to an anime site for. Light
 * at rest — an icon and a name — so the hero above stays the one loud
 * thing; on a computer, hovering a tile raises the first posters of what is
 * in it from its corner, and it says how many titles there are.
 */
export function HomeQuickLinks() {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const { data: curated } = useCuratedCollections();
  const season = seasonOf(new Date());
  const seasonName = seasonNameRu(season.season, "nom");
  const links: QuickLink[] = [
    { to: "/ongoing", title: "Онгоинги", hint: "Выходят сейчас", Icon: RadioIcon, curated: "airing-now" },
    { to: "/top", title: "Топ", hint: "Лучшее за всё время", Icon: TrophyIcon, curated: "start-here" },
    {
      to: landingPath({ kind: "season", ...season }),
      title: `${seasonName.charAt(0).toUpperCase()}${seasonName.slice(1)} ${season.year}`,
      hint: "Новинки сезона",
      Icon: CalendarIcon,
      curated: "season-best",
    },
    { to: "/movies", title: "Фильмы", hint: "Полнометражные", Icon: ClapperboardIcon, curated: "one-evening" },
    { to: "/announced", title: "Анонсы", hint: "Скоро выйдут", Icon: CalendarClockIcon },
    { to: "/collections", title: "Подборки", hint: "На любой вечер", Icon: LayersIcon },
    { to: "/browse?hasCustomPlayer=1", title: "Без рекламы", hint: "Свой плеер, до 1080p", Icon: MonitorPlayIcon, curated: "no-ads" },
  ];
  const byslug = new Map((curated?.items ?? []).map((c) => [c.slug, c]));

  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const r = await apiRequest<{ slug: string }>("/anime/random");
      navigate(`/anime/${r.slug}`);
    } catch {
      /* nothing to open */
    } finally {
      setRolling(false);
    }
  };

  return (
    <nav aria-label="Разделы" className="grid grid-cols-4 gap-x-1 gap-y-3 sm:gap-2.5 lg:grid-cols-8">
      {links.map(({ to, title, hint, Icon, curated: slug }) => {
        const collection = slug ? byslug.get(slug) : undefined;
        return (
          <Link key={to} to={to} viewTransition className={TILE}>
            {collection && <PosterFan covers={collection.covers} />}
            <span className={CHIP}>
              <Icon className="size-5 sm:size-[18px]" />
            </span>
            <TileText title={title} hint={collection ? titlesCount(collection.total) : hint} />
          </Link>
        );
      })}
      <button type="button" onClick={() => void roll()} className={TILE}>
        <span className={CHIP}>
          <DicesIcon
            className={cn(
              "size-5 transition-transform duration-500 group-hover:rotate-[200deg] sm:size-[18px]",
              rolling && "animate-spin",
            )}
          />
        </span>
        <TileText title="Случайное" hint="Мне повезёт" />
      </button>
    </nav>
  );
}

function TileText({ title, hint }: { title: string; hint: string }) {
  return (
    <span className="relative z-10 flex w-full min-w-0 flex-col">
      <span className="truncate text-[11.5px] font-medium leading-tight text-foreground/85 sm:text-sm sm:font-semibold sm:text-foreground">
        {title}
      </span>
      <span className="hidden truncate text-[11px] text-muted-foreground sm:block">{hint}</span>
    </span>
  );
}

/** Two posters that rise from the tile's corner when it is hovered. */
function PosterFan({ covers }: { covers: AnimeSummary[] }) {
  const two = covers.slice(0, 2);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-6 right-1 hidden translate-y-4 opacity-0 transition-[opacity,transform] duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 sm:flex"
    >
      {two.map((anime, i) => (
        <img
          key={anime.id}
          src={imageSrc(anime.imageUrl)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          className={cn(
            "aspect-[2/3] w-10 rounded-md object-cover shadow-lg shadow-black/40 ring-1 ring-black/30",
            i === 0 ? "-mr-4 -rotate-6 opacity-80" : "rotate-3",
          )}
        />
      ))}
    </span>
  );
}
