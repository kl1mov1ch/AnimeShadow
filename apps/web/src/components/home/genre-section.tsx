import type { AnimeSummary, Genre } from "@animeshadow/shared";
import {
  BotIcon,
  CompassIcon,
  DramaIcon,
  GhostIcon,
  HeartIcon,
  type LucideIcon,
  MusicIcon,
  RocketIcon,
  SchoolIcon,
  SearchIcon,
  SkullIcon,
  SmileIcon,
  SparklesIcon,
  SwordsIcon,
  TrophyIcon,
  WandSparklesIcon,
  ZapIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { imageSrc } from "@/lib/format";
import { GlyphWatermark, HomeContainer, Reveal, SectionHeading, Shine } from "./home-ui";

/**
 * A mark per genre, so the row reads as distinct places rather than tinted
 * copies of one card. Keyed by the catalogue's English genre names.
 */
const GENRE_ICON: Record<string, LucideIcon> = {
  Action: SwordsIcon,
  School: SchoolIcon,
  Mystery: SearchIcon,
  Music: MusicIcon,
  Mecha: BotIcon,
  "Slice of Life": SmileIcon,
  Fantasy: WandSparklesIcon,
  Adventure: CompassIcon,
  Drama: DramaIcon,
  Romance: HeartIcon,
  Comedy: SmileIcon,
  Horror: SkullIcon,
  Shounen: ZapIcon,
  Supernatural: GhostIcon,
  "Sci-Fi": RocketIcon,
  Sports: TrophyIcon,
};

/**
 * Genres, each wearing the poster of its own best-known title behind a red
 * wash — the picture stays faint so the name always wins, and lifts on
 * hover. No extra requests: the posters come from lists the page already
 * loaded.
 */
export function GenreSection({
  genres,
  label,
  posterFor,
}: {
  genres: Genre[];
  /** Localised genre name, from the app's own label helper. */
  label: (name: string) => string;
  /** The best-known title of that genre, if the page already has one. */
  posterFor: (genreName: string) => AnimeSummary | undefined;
}) {
  if (genres.length === 0) return null;
  return (
    <section className="relative overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg-alt)] py-12">
      <GlyphWatermark className="-left-14 bottom-0 text-[14rem] leading-none" />
      <HomeContainer className="relative">
        <Reveal>
          <SectionHeading
            label="Жанры"
            title="Жанры"
            subtitle="Самые просматриваемые категории у наших зрителей"
            action={{ to: "/browse", label: "Все жанры →" }}
          />
        </Reveal>
        <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {genres.slice(0, 7).map((genre, i) => {
            const Icon = GENRE_ICON[genre.name] ?? SparklesIcon;
            const poster = posterFor(genre.name);
            const art = poster ? imageSrc(poster.imageLargeUrl ?? poster.imageUrl) : undefined;
            return (
              <li key={genre.id} className="w-32 shrink-0 snap-start lg:w-auto">
                <Reveal delay={i * 60}>
                <Link
                  to={`/browse?genres=${genre.id}`}
                  title={poster ? (poster.titleLocalized ?? poster.title) : undefined}
                  className="group group/card relative flex h-40 flex-col items-center justify-end overflow-hidden rounded-xl border border-[var(--hm-border)] bg-[var(--hm-card)] p-3 transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--hm-accent)]/60"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {/* The genre's best-known poster, kept faint and red. */}
                  {art && (
                    <img
                      src={art}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full scale-105 object-cover opacity-25 saturate-[0.6] transition-all duration-500 group-hover:scale-110 group-hover:opacity-40"
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0 transition-opacity duration-500"
                    style={{
                      background:
                        "linear-gradient(180deg, color-mix(in srgb, var(--hm-accent) 26%, transparent) 0%, color-mix(in srgb, var(--hm-bg) 55%, transparent) 42%, var(--hm-bg) 100%)",
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(75% 60% at 50% 100%, color-mix(in srgb, var(--hm-accent) 45%, transparent), transparent 70%)",
                    }}
                  />

                  <Shine className="z-20" />

                  <span className="relative mb-auto mt-2 grid size-11 place-items-center rounded-xl border border-[var(--hm-border)] bg-[var(--hm-bg)]/60 text-[var(--hm-text)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[var(--hm-accent)] group-hover:text-[var(--hm-accent)]">
                    <Icon className="size-5 transition-transform duration-300 group-hover:scale-110" />
                  </span>

                  <span className="relative text-center">
                    <span className="home-display block text-sm text-[var(--hm-text)]">{label(genre.name)}</span>
                    {genre.count != null && (
                      <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--hm-muted)]">
                        {genre.count} тайтлов
                      </span>
                    )}
                  </span>
                  {/* A hairline that draws itself in under the name. */}
                  <span
                    aria-hidden
                    className="relative mt-2 h-0.5 w-0 rounded-full bg-[var(--hm-accent)] transition-all duration-300 group-hover:w-10"
                  />
                </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </HomeContainer>
    </section>
  );
}
