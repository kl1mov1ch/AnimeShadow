import { landingPath, seasonNameRu, seasonOf } from "@animeshadow/shared";
import {
  CalendarClockIcon,
  CalendarIcon,
  ClapperboardIcon,
  type LucideIcon,
  MonitorPlayIcon,
  RadioIcon,
  ShuffleIcon,
  TrophyIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

interface QuickLink {
  to: string;
  title: string;
  hint: string;
  Icon: LucideIcon;
}

const TILE =
  "group flex min-w-[10.5rem] shrink-0 items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-3.5 py-3 text-left transition-[border-color,background-color] duration-300 hover:border-foreground/20 hover:bg-card sm:min-w-0";

/**
 * Right under the hero: the lists people come to an anime site for, each
 * with a line saying what is in it — so the first screen already shows
 * what the site has, not only what it recommends.
 */
export function HomeQuickLinks() {
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);
  const season = seasonOf(new Date());
  const seasonName = seasonNameRu(season.season, "nom");
  const links: QuickLink[] = [
    { to: "/ongoing", title: "Онгоинги", hint: "Выходят сейчас", Icon: RadioIcon },
    { to: "/top", title: "Топ аниме", hint: "Лучшее за всё время", Icon: TrophyIcon },
    {
      to: landingPath({ kind: "season", ...season }),
      title: `${seasonName.charAt(0).toUpperCase()}${seasonName.slice(1)} ${season.year}`,
      hint: "Новинки сезона",
      Icon: CalendarIcon,
    },
    { to: "/movies", title: "Фильмы", hint: "Полнометражные", Icon: ClapperboardIcon },
    { to: "/announced", title: "Анонсы", hint: "Скоро выйдут", Icon: CalendarClockIcon },
    { to: "/browse?hasCustomPlayer=1", title: "Свой плеер", hint: "До 1080p, без рамок", Icon: MonitorPlayIcon },
  ];

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
      className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-7 [&::-webkit-scrollbar]:hidden"
    >
      {links.map(({ to, title, hint, Icon }) => (
        <Link key={to} to={to} viewTransition className={TILE}>
          <Tile Icon={Icon} title={title} hint={hint} />
        </Link>
      ))}
      <button type="button" onClick={() => void roll()} className={TILE}>
        <Tile Icon={ShuffleIcon} title="Случайное" hint="Мне повезёт" spin={rolling} />
      </button>
    </nav>
  );
}

function Tile({ Icon, title, hint, spin = false }: { Icon: LucideIcon; title: string; hint: string; spin?: boolean }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/80 transition-colors duration-300 group-hover:bg-primary/15 group-hover:text-primary">
        <Icon className={cn("size-5", spin && "animate-spin")} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </>
  );
}
