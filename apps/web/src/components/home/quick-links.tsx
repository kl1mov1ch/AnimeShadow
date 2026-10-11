import type { AnimeSummary } from "@animeshadow/shared";
import { landingPath, seasonNameRu, seasonOf } from "@animeshadow/shared";
import {
  CalendarClockIcon,
  CalendarIcon,
  ClapperboardIcon,
  DicesIcon,
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
  title: string;
  hint: string;
  Icon: LucideIcon;
  /** The themed collection whose posters and count the tile shows. */
  curated?: string;
}

const TILE =
  "group relative flex h-[5.5rem] w-[11.5rem] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-card/60 p-3 text-left transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card active:scale-[0.98] sm:w-auto";

/**
 * Right under the hero: the lists people come to an anime site for, as
 * tiles that show what is in them — a fan of their first posters peeking
 * from the corner, rising on hover, and how many titles there are (from
 * the themed collections) — so the first screen already shows what the
 * site has, not only what it recommends. A row that scrolls sideways on a
 * phone, a grid on a computer.
 */
export function HomeQuickLinks() {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const { data: curated } = useCuratedCollections();
  const season = seasonOf(new Date());
  const seasonName = seasonNameRu(season.season, "nom");
  const links: QuickLink[] = [
    { to: "/ongoing", title: "Онгоинги", hint: "Выходят сейчас", Icon: RadioIcon, curated: "airing-now" },
    { to: "/top", title: "Топ аниме", hint: "Лучшее за всё время", Icon: TrophyIcon, curated: "start-here" },
    {
      to: landingPath({ kind: "season", ...season }),
      title: `${seasonName.charAt(0).toUpperCase()}${seasonName.slice(1)} ${season.year}`,
      hint: "Новинки сезона",
      Icon: CalendarIcon,
      curated: "season-best",
    },
    { to: "/movies", title: "Фильмы", hint: "Полнометражные", Icon: ClapperboardIcon, curated: "one-evening" },
    { to: "/announced", title: "Анонсы", hint: "Скоро выйдут", Icon: CalendarClockIcon },
    { to: "/browse?hasCustomPlayer=1", title: "Свой плеер", hint: "До 1080p, без рекламы", Icon: MonitorPlayIcon, curated: "no-ads" },
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
    <nav
      aria-label="Разделы"
      className="-mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-7 [&::-webkit-scrollbar]:hidden"
    >
      {links.map(({ to, title, hint, Icon, curated: slug }) => {
        const collection = slug ? byslug.get(slug) : undefined;
        return (
          <Link key={to} to={to} viewTransition className={TILE}>
            {collection && <PosterFan covers={collection.covers} />}
            <span className="relative z-10 grid size-8 place-items-center rounded-lg bg-foreground/[0.07] text-foreground/80 transition-colors duration-300 group-hover:bg-primary/15 group-hover:text-primary">
              <Icon className="size-[18px]" />
            </span>
            <span className="relative z-10 flex min-w-0 flex-col pr-10">
              <span className="truncate text-sm font-semibold">{title}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {collection ? titlesCount(collection.total) : hint}
              </span>
            </span>
          </Link>
        );
      })}
      <button type="button" onClick={() => void roll()} className={TILE}>
        <span className="relative z-10 grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <DicesIcon
            className={cn(
              "size-[18px] transition-transform duration-500 group-hover:rotate-[200deg]",
              rolling && "animate-spin",
            )}
          />
        </span>
        <span className="relative z-10 flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">Случайное</span>
          <span className="truncate text-[11px] text-muted-foreground">Мне повезёт</span>
        </span>
      </button>
    </nav>
  );
}

/** Two posters peeking from the tile's corner, rising a little on hover. */
function PosterFan({ covers }: { covers: AnimeSummary[] }) {
  const two = covers.slice(0, 2);
  return (
    <span aria-hidden className="pointer-events-none absolute -bottom-5 right-1 flex">
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
            "aspect-[2/3] w-11 rounded-md object-cover shadow-lg shadow-black/40 ring-1 ring-black/30 transition-transform duration-300 ease-out",
            i === 0 ? "-mr-4 -rotate-6 opacity-80 group-hover:-translate-y-2" : "rotate-3 group-hover:-translate-y-3",
          )}
        />
      ))}
    </span>
  );
}
