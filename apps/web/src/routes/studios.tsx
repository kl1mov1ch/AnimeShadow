import type { DubStudio } from "@animeshadow/shared";
import { ArrowRightIcon, MicVocalIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DubLogo } from "@/components/anime/dub-logo";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { PageHero } from "@/components/common/page-hero";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { imageSrc } from "@/lib/format";
import { useDubStudios } from "@/lib/query";
import { useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** Hon-Kon has its own page (team, releases, videos); every other studio gets the catalogue page. */
const isHonKon = (studio: DubStudio) => /^hon[\s-]*kon/i.test(studio.name);
export const studioHref = (studio: DubStudio) => (isHonKon(studio) ? "/studio/hon-kon" : `/studios/${studio.slug}`);

const plural = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "тайтлов";
  if (n % 10 === 1) return "тайтл";
  if (n % 10 >= 2 && n % 10 <= 4) return "тайтла";
  return "тайтлов";
};

/**
 * Every dub studio the site can play, as a wall of cards: the studio's mark,
 * its name, how much it voiced, and a fan of its best-known posters behind.
 * The studio is the way in for someone who already knows whose voices they
 * want — "everything AniLibria did" is one tap, not a search.
 */
export function Component() {
  useDocumentHead({
    title: "Студии озвучки аниме — AniLibria, AniDUB, Hon-Kon и другие | AnimeShadow",
    description:
      "Все студии озвучки аниме в одном месте: AniLibria, AniDUB, StudioBand, Hon-Kon Studio и другие. Выберите студию — и смотрите всё аниме в её озвучке онлайн.",
    path: "/studios",
  });
  const { data, isPending, isError, refetch } = useDubStudios();
  const [query, setQuery] = useState("");
  const studios = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru");
    return (data ?? []).filter((studio) => !term || studio.name.toLocaleLowerCase("ru").includes(term));
  }, [data, query]);
  const honkon = data?.find(isHonKon);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHero
        icon={MicVocalIcon}
        eyebrow="Студии озвучки"
        title="Чьими голосами смотреть"
        lead="Каждая студия — со своим каталогом: всё аниме в её озвучке, с поиском и фильтрами."
        aside={
          <label className="relative block w-full md:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">Найти студию</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Найти студию"
              className="h-10 w-full rounded-xl border border-border/60 bg-card/60 pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
        }
      />

      {!query && (
        <Link
          to="/studio/hon-kon"
          className="group relative isolate flex items-center gap-4 overflow-hidden rounded-3xl border border-[#ff6f61]/40 bg-[#ff6f61]/[0.07] p-4 transition-colors hover:border-[#ff6f61]/70 sm:p-5"
        >
          <span aria-hidden className="absolute -right-10 -top-16 -z-10 size-56 rounded-full bg-[#ff6f61]/20 blur-3xl transition-transform duration-500 group-hover:scale-110" />
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#ff6f61] text-white shadow-lg shadow-[#ff6f61]/30">
            <HonkonGlyph className="size-8" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#ff6f61]">Студия-партнёр</span>
            <span className="block font-display text-xl leading-tight">Hon-Kon Studio</span>
            <span className="block truncate text-xs text-muted-foreground sm:text-sm">
              Команда, релизы и видео студии{honkon ? ` · ${honkon.count} ${plural(honkon.count)}` : ""}
            </span>
          </span>
          <ArrowRightIcon className="size-5 shrink-0 text-[#ff6f61] transition-transform group-hover:translate-x-1" />
        </Link>
      )}

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : studios.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Такой студии не нашлось.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {studios.map((studio, index) => (
            <StudioCard key={studio.slug} studio={studio} eager={index < 8} />
          ))}
        </div>
      )}
    </div>
  );
}

function StudioCard({ studio, eager }: { studio: DubStudio; eager: boolean }) {
  const posters = studio.posters.slice(0, 3);
  return (
    <Link
      to={studioHref(studio)}
      className="group relative isolate flex h-40 flex-col justify-end overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-3 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl hover:shadow-black/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:h-44"
    >
      {/* Its best-known posters, fanned out behind the name. */}
      <span aria-hidden className="absolute inset-x-0 top-0 -z-10 flex h-28 justify-center gap-0 pt-3">
        {posters.map((poster, i) => (
          <img
            key={poster}
            src={imageSrc(poster, 240)}
            alt=""
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            className={cn(
              "aspect-[2/3] h-full rounded-lg object-cover shadow-lg ring-1 ring-black/30 transition-transform duration-300",
              posters.length > 1 && i === 0 && "-mr-6 translate-y-2 -rotate-[8deg] group-hover:-translate-x-2 group-hover:-rotate-[12deg]",
              posters.length > 1 && i === 1 && "z-10 group-hover:-translate-y-1",
              i === 2 && "-ml-6 translate-y-2 rotate-[8deg] group-hover:translate-x-2 group-hover:rotate-[12deg]",
            )}
          />
        ))}
      </span>
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-card via-card/85 to-card/10" />
      <span className="flex items-center gap-2.5">
        <DubLogo name={studio.name} className="size-9 rounded-xl" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight">{studio.name}</span>
          <span className="block text-xs tabular-nums text-muted-foreground">
            {studio.count} {plural(studio.count)}
          </span>
        </span>
      </span>
    </Link>
  );
}
