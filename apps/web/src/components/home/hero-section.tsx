import type { AnimeDetail } from "@animeshadow/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MonitorPlayIcon,
  PlayIcon,
  ShieldOffIcon,
  StarIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { OpeningVideo } from "@/components/anime/opening-video";
import { animeHref, fullSizeCover, imageSrc } from "@/lib/format";
import { HomeButton, HomeContainer, Shine } from "./home-ui";

const PERKS = [
  { icon: MonitorPlayIcon, title: "HD", note: "Качество" },
  { icon: ShieldOffIcon, title: "Без рекламы", note: "(для подписчиков)" },
  { icon: ZapIcon, title: "Быстрый", note: "доступ" },
];

/** How long one slide holds before the next. */
const SLIDE_MS = 8000;
/** A beat before the opening is even requested, so flicking past costs nothing. */
const VIDEO_DELAY_MS = 1200;

/** Our own artwork: the first slide, and the backdrop under every other one. */
const BRAND_ART = "/home/hero.webp";

/**
 * The cinematic banner. Real titles from the catalogue: their own key
 * visual behind, their opening playing over it once the slide settles,
 * their name and synopsis on the left, and "Смотреть сейчас" opening that
 * title. Dots and arrows change slides; the rotation stops while a pointer
 * is over the banner.
 */
export function HeroSection({ slides = [] }: { slides?: AnimeDetail[] }) {
  // Slide 0 is ours — the site's own key visual — and the titles follow.
  const items = slides.slice(0, 5);
  const count = items.length + 1;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [wantsVideo, setWantsVideo] = useState(false);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  // A new slide starts as a still; the opening joins a moment later.
  useEffect(() => {
    setWantsVideo(false);
    const timer = setTimeout(() => setWantsVideo(true), VIDEO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [index]);

  const step = (direction: 1 | -1) => setIndex((i) => (i + direction + count) % count);
  const current = index === 0 ? undefined : items[index - 1];
  const art = current
    ? imageSrc(current.bannerImage ?? fullSizeCover(current.imageLargeUrl ?? current.imageUrl))
    : undefined;

  return (
    <section
      className="relative isolate overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg)]"
    >
      {/* The title's own art, wide behind everything, with our own artwork
          underneath it so the banner is never empty. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <img
          src={BRAND_ART}
          alt=""
          fetchPriority="high"
          className="home-kenburns absolute inset-0 size-full object-cover object-center"
          style={{ filter: "brightness(var(--hm-art-brightness))" }}
        />
        {art && (
          <img
            key={art}
            src={art}
            alt=""
            className="home-kenburns absolute inset-0 size-full animate-in fade-in object-cover object-center duration-700"
          />
        )}
        {/* The opening, once the slide has settled — it fades itself in only
            when there are real frames, and refuses on touch or a metered
            connection, so this is an upgrade or nothing. */}
        {current && (
          <OpeningVideo animeId={current.id} active={wantsVideo && !paused} className="absolute inset-0" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--hm-bg) 0%, color-mix(in srgb, var(--hm-bg) 82%, transparent) 38%, color-mix(in srgb, var(--hm-bg) 25%, transparent) 70%, var(--hm-bg) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, var(--hm-bg) 2%, transparent 55%)" }}
        />
      </div>

      <HomeContainer className="relative grid items-center gap-8 py-12 lg:min-h-[520px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-16">
        <div className="flex flex-col items-start">
          <span className="rounded-md border border-[var(--hm-border)] bg-[var(--hm-card)]/80 px-2.5 py-1 text-[11px] font-medium text-[var(--hm-muted)] backdrop-blur-sm">
            Добро пожаловать
          </span>

          <h1 className="home-display mt-5 text-5xl leading-[0.95] tracking-tight sm:text-6xl lg:text-[64px]">
            <span className="block text-[var(--hm-text)]">ANIME</span>
            <span className="block text-[var(--hm-accent)]">SHADOW</span>
          </h1>

          <p className="mt-3 text-lg font-semibold text-[var(--hm-text)]">Твой мир аниме — без границ</p>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--hm-muted)]">
            Сотни тайтлов, в отличном качестве, с удобным плеером и регулярными обновлениями.
            Погрузись в мир, где оживают твои любимые истории.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <HomeButton to={current ? animeHref(current) : "/browse"}>
              <PlayIcon className="size-4 fill-current" />
              Смотреть сейчас
            </HomeButton>
            <HomeButton to="/browse" variant="outline">
              Каталог →
            </HomeButton>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
            {PERKS.map(({ icon: Icon, title, note }) => (
              <li key={title} className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg border border-[var(--hm-border)] bg-[var(--hm-card)]/80 text-[var(--hm-accent)] backdrop-blur-sm">
                  <Icon className="size-4" />
                </span>
                <span className="leading-tight">
                  <span className="block text-xs font-semibold text-[var(--hm-text)]">{title}</span>
                  <span className="block text-[11px] text-[var(--hm-muted)]">{note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* What is actually on screen right now: the title, its score and
            genres, sitting over its own artwork. */}
        {current && (
          <div
            key={current.id}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            className="animate-in fade-in slide-in-from-right-4 hidden justify-self-end duration-500 lg:block"
          >
            <div className="home-float max-w-sm rounded-2xl border border-[var(--hm-border)] bg-[var(--hm-card)]/70 p-4 backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--hm-accent)]">Выходит сейчас</p>
              <h2 className="home-display mt-2 line-clamp-2 text-xl text-[var(--hm-text)]">
                {current.titleLocalized ?? current.title}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--hm-muted)]">
                {current.score != null && (
                  <span className="inline-flex items-center gap-1 text-[var(--hm-text)]">
                    <StarIcon className="size-3 fill-[var(--hm-accent)] text-[var(--hm-accent)]" />
                    {current.score.toFixed(1)}
                  </span>
                )}
                {current.year && <span>{current.year}</span>}
                {current.episodes && <span>{current.episodes} серий</span>}
              </p>
              {current.synopsis && (
                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[var(--hm-muted)]">
                  {current.synopsis}
                </p>
              )}
              <p className="mt-3 flex flex-wrap gap-1.5">
                {current.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="rounded-md border border-[var(--hm-border)] px-2 py-0.5 text-[10px] text-[var(--hm-muted)]"
                  >
                    {genre}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}
      </HomeContainer>

      {/* The controls, centred under the banner: an arrow either side of the
          dots, and each dot fills while its slide is on screen so the wait
          is visible. The banner also turns itself. */}
      <HomeContainer className="relative flex items-center justify-center gap-3 pb-7">
        <StepButton label="Предыдущий слайд" onClick={() => step(-1)}>
          <ChevronLeftIcon className="size-4" />
        </StepButton>

        <div className="flex items-center gap-2">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={i === 0 ? "AnimeShadow" : `Слайд ${i + 1}`}
              aria-current={i === index}
              className="group/dot h-1.5 rounded-lg transition-all duration-500"
              style={{ width: i === index ? 44 : 10 }}
            >
              <span className="block h-full w-full overflow-hidden rounded-full bg-[var(--hm-text)]/20 transition-colors group-hover/dot:bg-[var(--hm-text)]/40">
                {i === index && (
                  <span
                    key={`${index}-${paused}`}
                    className="block h-full rounded-full bg-[var(--hm-accent)]"
                    style={{
                      animation: paused ? "none" : `home-slide-progress ${SLIDE_MS}ms linear forwards`,
                      width: paused ? "100%" : undefined,
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>

        <StepButton label="Следующий слайд" onClick={() => step(1)}>
          <ChevronRightIcon className="size-4" />
        </StepButton>
      </HomeContainer>
    </section>
  );
}

/** One of the two arrows beside the dots — same light sweep as every button. */
function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group/btn relative isolate grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--hm-border)] bg-[var(--hm-card)]/70 text-[var(--hm-muted)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--hm-accent)] hover:text-[var(--hm-text)] active:scale-95"
    >
      <span className="relative z-10">{children}</span>
      <Shine />
    </button>
  );
}
