import { LibraryBigIcon, type LucideIcon, MonitorPlayIcon, RefreshCwIcon, SlidersHorizontalIcon } from "lucide-react";
import { GlyphWatermark, HomeButton, HomeContainer, Reveal, Shine } from "./home-ui";

const FEATURES: Array<{ icon: LucideIcon; title: string; note: string }> = [
  { icon: LibraryBigIcon, title: "Огромная библиотека", note: "Сотни тайтлов на любой вкус" },
  { icon: MonitorPlayIcon, title: "Высокое качество", note: "HD и FullHD, без потерь" },
  { icon: SlidersHorizontalIcon, title: "Удобный плеер", note: "Настрой просмотр под себя" },
  { icon: RefreshCwIcon, title: "Регулярные обновления", note: "Новые серии каждый день" },
];

/** Artwork on the left, the pitch and a 2×2 grid of reasons on the right. */
export function FeatureSection() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--hm-border)] bg-[var(--hm-bg)]">
      <div className="grid items-stretch lg:grid-cols-2">
        <div className="relative min-h-[260px] overflow-hidden lg:min-h-[420px]">
          <img
            src="/home/wide.webp"
            alt=""
            loading="lazy"
            className="home-kenburns absolute inset-0 size-full object-cover"
            style={{ filter: "brightness(var(--hm-art-brightness))" }}
          />
          {/* Fades into the page on the right, so the picture and the text
              read as one band rather than two. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, transparent 40%, color-mix(in srgb, var(--hm-bg) 75%, transparent) 78%, var(--hm-bg) 100%), linear-gradient(to top, color-mix(in srgb, var(--hm-bg) 70%, transparent), transparent 55%)",
            }}
          />
        </div>

        <GlyphWatermark className="-right-10 bottom-0 text-[13rem] leading-none" />
        <div className="relative flex items-center py-12">
          <HomeContainer className="max-w-[600px] sm:px-8 lg:pr-8">
            <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hm-accent)]">
              Почему AnimeShadow?
            </p>
            <h2 className="home-display mt-3 text-3xl leading-tight text-[var(--hm-text)] sm:text-[34px]">
              Больше, чем просто
              <br />
              просмотр аниме
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--hm-muted)]">
              Мы создаём пространство, где каждый найдёт своё аниме. Удобный интерфейс, стабильная
              работа, огромная библиотека и постоянные обновления.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, note }) => (
                <div
                  key={title}
                  className="group/card relative isolate flex items-start gap-3 overflow-hidden rounded-xl border border-[var(--hm-border)] bg-[var(--hm-card-alt)] p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--hm-accent)]/50"
                >
                  <Shine />
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--hm-accent-soft)] text-[var(--hm-accent)] transition-transform duration-500 group-hover/card:-rotate-6 group-hover/card:scale-110">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--hm-text)]">{title}</span>
                    <span className="block text-[11px] leading-snug text-[var(--hm-muted)]">{note}</span>
                  </span>
                </div>
              ))}
            </div>

            <HomeButton to="/browse" className="mt-7">
              Начать просмотр →
            </HomeButton>
            </Reveal>
          </HomeContainer>
        </div>
      </div>
    </section>
  );
}
