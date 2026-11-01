import type { ReactNode } from "react";
import type { AnimeSummary } from "@animeshadow/shared";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon, PlayIcon } from "lucide-react";
import { imageSrc } from "@/lib/format";

export function CatalogIntro({
  items,
  children,
  searching,
  playable,
  onPlayable,
}: {
  items: AnimeSummary[];
  children: ReactNode;
  searching: boolean;
  playable: boolean;
  onPlayable: () => void;
}) {
  const posters = items
    .filter((item) => item.imageUrl || item.imageLargeUrl)
    .slice(0, 4);
  return (
    <header className="catalog-intro relative isolate overflow-hidden rounded-[1.5rem] border border-border/70 bg-card">
      <div
        className="pointer-events-none absolute -right-8 -top-12 -z-10 font-display text-[18rem] leading-none text-primary/[0.04]"
        aria-hidden
      >
        影
      </div>
      <div
        className={`relative flex items-center justify-between gap-5 px-5 pb-6 pt-7 sm:px-8 sm:pt-9 ${searching ? "" : "sm:min-h-60"}`}
      >
        <div className="relative z-10 max-w-xl sm:max-w-[60%]">
          <h1 className="font-display text-2xl leading-tight tracking-tight sm:text-4xl">
            Каталог аниме
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {searching
              ? "Найдём по названию, персонажу или описанию. Уточни фильтры, чтобы выбрать своё."
              : "Большие миры. Короткие истории. Твоё следующее любимое аниме — где-то здесь."}
          </p>
          {!searching && (
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
              <button
                type="button"
                aria-pressed={playable}
                onClick={onPlayable}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 font-medium transition-colors ${playable ? "border-primary bg-primary text-primary-foreground" : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"}`}
              >
                <PlayIcon className="size-3.5 fill-current" />
                Можно смотреть сейчас
              </button>
              <Link
                to="/studios"
                className="inline-flex min-h-10 items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                Выбрать озвучку
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            </div>
          )}
        </div>
        {!searching && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -right-4 hidden w-[43%] items-center justify-center overflow-hidden sm:flex"
          >
            <div className="absolute inset-0 bg-radial from-primary/15 via-transparent to-transparent" />
            {posters.map((anime, index) => (
              <img
                key={anime.id}
                src={imageSrc(anime.imageLargeUrl ?? anime.imageUrl, 360)}
                alt=""
                decoding="async"
                className="absolute w-[37%] max-w-40 rounded-xl border border-white/15 object-cover shadow-2xl"
                style={{
                  aspectRatio: "2/3",
                  transform: `translateX(${(index - 1.5) * 52}%) translateY(${[18, -4, 5, 24][index]}px) rotate(${[-15, -5, 7, 17][index]}deg)`,
                  zIndex: index === 1 ? 4 : 3 - index,
                  opacity: index === 0 || index === 3 ? 0.5 : 0.9,
                }}
              />
            ))}
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-card via-transparent to-card/10" />
          </div>
        )}
      </div>
      <div className="relative z-20 flex flex-col gap-4 border-t border-border/60 bg-background/35 p-4 sm:px-8 sm:py-5">
        {children}
      </div>
    </header>
  );
}
