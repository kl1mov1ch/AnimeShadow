import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  HeadphonesIcon,
  ImageIcon,
  TrophyIcon,
} from "lucide-react";
import { Link, NavLink, Navigate, useParams } from "react-router-dom";
import { AnimeCorner } from "@/components/home/anime-corner";
import { DailyChallenge } from "@/components/games/daily-challenge";
import { GamesHome } from "@/components/games/games-home";
import { useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

const MODES = [
  {
    path: "guess",
    label: "По картинке",
    title: "Угадай аниме по картинке",
    icon: ImageIcon,
  },
  {
    path: "opening",
    label: "По опенингу",
    title: "Угадай аниме по опенингу",
    icon: HeadphonesIcon,
  },
  { path: "daily", label: "Вызов дня", title: "Вызов дня", icon: CalendarDaysIcon },
] as const;

export function Component() {
  const { mode } = useParams();
  const current = MODES.find((m) => m.path === mode);
  useDocumentHead({
    title: `${mode === "opening" ? "Угадай аниме по опенингу" : mode === "daily" ? "Общий вызов дня" : mode === "guess" ? "Угадай аниме по картинке" : "Аниме-игры и рейтинги"} | AnimeShadow`,
    description:
      "Угадывай аниме по кадрам и опенингам, проходи общий вызов дня и соревнуйся с другими зрителями.",
    path: mode ? `/games/${mode}` : "/games",
  });
  if (mode && !MODES.some((m) => m.path === mode))
    return <Navigate to="/games" replace />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:gap-6">
      {!mode ? (
        <GamesHome />
      ) : (
        <>
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/games"
                className="inline-flex min-h-9 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeftIcon className="size-4" />
                Все игры
              </Link>
              <Link
                to="/leaderboards"
                className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground hover:text-primary"
              >
                <TrophyIcon className="size-4" />
                Топ зрителей
              </Link>
            </div>
            <h1 className="text-balance font-display text-2xl sm:text-3xl">
              {current?.title}
            </h1>
          </header>
          <nav
            aria-label="Режимы игры"
            className="grid grid-cols-3 gap-1 rounded-xl border border-border/60 bg-card/60 p-1 sm:w-fit sm:gap-2"
          >
            {MODES.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={`/games/${path}`}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary sm:min-h-10 sm:px-5 sm:text-sm",
                    isActive
                      ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          {mode === "daily" ? (
            <DailyChallenge />
          ) : (
            <AnimeCorner key={mode} mode={mode as "guess" | "opening"} />
          )}
        </>
      )}
    </div>
  );
}
