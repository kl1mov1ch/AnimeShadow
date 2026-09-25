import { PlayIcon, SparklesIcon } from "lucide-react";
import { HomeButton, HomeContainer, Reveal } from "./home-ui";

/**
 * The closing banner: the invitation on the left over the wide key visual,
 * a vertical line of Japanese down the right edge (the mock's own flourish),
 * and the page's last two buttons.
 */
export function CtaSection() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg-alt)]">
      <img
        src="/home/hero.webp"
        alt=""
        loading="lazy"
        aria-hidden
        className="home-kenburns absolute inset-0 size-full object-cover object-right"
        style={{ filter: "brightness(var(--hm-art-brightness))" }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--hm-bg) 10%, color-mix(in srgb, var(--hm-bg) 78%, transparent) 46%, color-mix(in srgb, var(--hm-bg) 20%, transparent) 100%)",
        }}
      />
      {/* The accent hairline every other band wears along its top edge. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, color-mix(in srgb, var(--hm-accent) 70%, transparent), transparent)",
        }}
      />

      <HomeContainer className="relative grid items-center gap-8 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)] lg:py-20">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-md border border-[var(--hm-border)] bg-[var(--hm-card)]/70 px-2.5 py-1 text-[11px] font-medium text-[var(--hm-muted)]">
            <SparklesIcon className="size-3 text-[var(--hm-accent)]" />
            Смотреть можно бесплатно
          </span>

          <h2 className="home-display mt-4 text-[34px] leading-[1.05] text-[var(--hm-text)] sm:text-[42px]">
            Погрузись в мир
            <br />
            <span className="text-[var(--hm-accent)]">аниме уже сегодня</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--hm-muted)]">
            Тысячи историй ждут тебя. Выбери своё аниме и начни просмотр прямо сейчас — список,
            прогресс по сериям и оценки останутся с тобой.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <HomeButton to="/browse">
              <PlayIcon className="size-4 fill-current" />
              Начать просмотр
            </HomeButton>
            <HomeButton to="/register" variant="outline">
              Создать аккаунт →
            </HomeButton>
          </div>
        </Reveal>

        {/* The mock's vertical kanji, decoration only. */}
        <span
          aria-hidden
          className="pointer-events-none hidden select-none justify-self-end text-right text-sm tracking-[0.5em] text-[var(--hm-text)]/35 lg:block"
          style={{ writingMode: "vertical-rl" }}
        >
          アニメは永遠に
        </span>
      </HomeContainer>
    </section>
  );
}
