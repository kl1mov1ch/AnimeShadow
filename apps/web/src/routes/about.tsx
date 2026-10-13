import {
  ArrowRightIcon,
  BookOpenIcon,
  DatabaseIcon,
  HeartIcon,
  InfoIcon,
  ListChecksIcon,
  type LucideIcon,
  MoonIcon,
  PlayIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react";
import { type CSSProperties, useState } from "react";
import { ReactionGif } from "@/components/common/reaction-gif";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { PageHero, SectionTitle } from "@/components/common/page-hero";
import { useT } from "@/i18n";
import { BOOSTY_URL } from "@/lib/support-links";

const reveal = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * Who made this and why, in the same visual language as the rest of the
 * site: the accent hero, cards on the accent surface, one warm ask for
 * support that leads to the support page rather than straight out.
 */
export function Component() {
  const t = useT();

  const features: Array<{ icon: LucideIcon; title: string; body: string }> = [
    { icon: BookOpenIcon, title: t("about.features.catalogTitle"), body: t("about.features.catalogBody") },
    { icon: ListChecksIcon, title: t("about.features.trackTitle"), body: t("about.features.trackBody") },
    { icon: PlayIcon, title: t("about.features.playerTitle"), body: t("about.features.playerBody") },
    { icon: MoonIcon, title: t("about.features.calmTitle"), body: t("about.features.calmBody") },
  ];

  const steps: Array<{ icon: LucideIcon; title: string; body: string }> = [
    { icon: DatabaseIcon, title: t("about.steps.catalogTitle"), body: t("about.steps.catalogBody") },
    { icon: PlayIcon, title: t("about.steps.videoTitle"), body: t("about.steps.videoBody") },
    { icon: ListChecksIcon, title: t("about.steps.listTitle"), body: t("about.steps.listBody") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-5xl flex-col gap-8 py-4 sm:gap-12 sm:py-6">
      <div className="reveal" style={reveal(0)}>
        <PageHero
          icon={InfoIcon}
          eyebrow={t("about.eyebrow")}
          title={t("about.title")}
          lead={t("about.lead")}
          aside={
            <div className="relative hidden w-56 md:block">
              <ReactionGif category="wave" className="aspect-square w-full shadow-xl shadow-black/30" />
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[var(--accent-line-soft)] bg-card px-3 py-1 text-xs font-semibold shadow-lg">
                Привет! Добро пожаловать 👋
              </span>
            </div>
          }
        >
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/browse"
              viewTransition
              className="group inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              {t("about.ctaButton")}
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/support"
              viewTransition
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <HeartIcon className="size-4" />
              {t("about.supportCta")}
            </Link>
          </div>
        </PageHero>
      </div>

      {/* Why it exists, in the maker's own voice. */}
      <section
        className="reveal relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5 sm:flex-row sm:items-center sm:p-6"
        style={reveal(1)}
      >
        <p className="leading-relaxed text-foreground/90">{t("about.introBody")}</p>
      </section>

      <section className="reveal flex flex-col gap-4" style={reveal(2)}>
        <SectionTitle icon={SparklesIcon} title={t("about.featuresTitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
              className="group relative flex animate-in flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-card/60 p-5 fade-in-0 slide-in-from-bottom-2 duration-500 transition-all hover:border-primary/50 hover:shadow-lg"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 sm:opacity-0"
              />
              <span className="relative grid size-11 place-items-center rounded-xl bg-foreground/[0.06] text-foreground/80 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                <Icon className="size-5" />
              </span>
              <h3 className="relative font-semibold">{title}</h3>
              <p className="relative text-sm leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="reveal flex flex-col gap-4" style={reveal(3)}>
        <SectionTitle icon={WorkflowIcon} title={t("about.howTitle")} note={t("about.howBody")} />
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="relative flex gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5"
            >
              <span className="relative flex flex-col items-center">
                <span className="grid size-10 place-items-center rounded-full border-2 border-primary bg-background font-display text-sm text-primary shadow-md">
                  {i + 1}
                </span>
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="flex items-center gap-1.5 font-semibold">
                  <Icon className="size-4 text-primary" />
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="reveal flex flex-col gap-4" style={reveal(4)}>
        <SectionTitle icon={InfoIcon} title="Частые вопросы" />
        <Faq />
      </section>

      {/* The one ask on the page — warm, and it goes to the page that
          explains what support gets you before anything leaves the site. */}
      <section
        id="support"
        className="reveal relative flex scroll-mt-24 flex-col items-start gap-5 overflow-hidden rounded-2xl border border-border/70 bg-card/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        style={reveal(5)}
      >
        <div className="relative flex items-start gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="flex items-center gap-2 font-display text-xl">
              <HeartIcon className="size-5 fill-primary text-primary" />
              {t("about.supportTitle")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t("about.supportBody")}</p>
          </div>
        </div>
        <div className="relative flex shrink-0 flex-wrap gap-2">
          <Link
            to="/support"
            viewTransition
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <HeartIcon className="size-4 fill-current" />
            {t("about.supportCta")}
          </Link>
          <a
            href={BOOSTY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-xl border border-border/70 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Boosty
          </a>
        </div>
      </section>
    </div>
  );
}

const FAQ: Array<{ q: string; a: string; gif: string }> = [
  { q: "Это правда бесплатно?", a: "Да. Смотреть, вести список и собирать подборки можно без оплаты. PRO — это добровольная поддержка с приятными мелочами для профиля.", gif: "thumbsup" },
  { q: "Откуда берутся серии?", a: "Мы не храним видео: плееры подключаются от партнёров — Kodik и AniLibria. Мы собираем для них удобный каталог, список и поиск.", gif: "think" },
  { q: "Будет ли реклама?", a: "В нашем собственном плеере рекламы нет. В плеерах партнёров реклама может быть — её показывают они, а не мы.", gif: "shrug" },
  { q: "Как не потерять, где остановился?", a: "Войдите в аккаунт — серии отмечаются сами, а «Продолжить просмотр» на главной откроет нужную серию с того же места.", gif: "smile" },
  { q: "Можно попросить добавить аниме?", a: "Конечно — напишите нам в Telegram. Новые серии и тайтлы появляются автоматически, но о пропусках лучше сказать.", gif: "highfive" },
];

/** Questions as a list; the open answer shows with a little face of its own. */
function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      {FAQ.map((item, i) => {
        const on = open === i;
        return (
          <div key={item.q} className={cn("overflow-hidden rounded-2xl border transition-colors", on ? "border-primary/40 bg-[var(--accent-surface)]" : "border-border/60 bg-card/40")}>
            <button
              type="button"
              onClick={() => setOpen(on ? -1 : i)}
              aria-expanded={on}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-semibold"
            >
              {item.q}
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs transition-transform duration-200", on && "rotate-45 bg-primary/15 text-primary")}>+</span>
            </button>
            {on && (
              <div className="flex animate-in items-center gap-4 px-4 pb-4 duration-300 fade-in-0">
                <ReactionGif category={item.gif} className="size-16 shrink-0 sm:size-20" />
                <p className="text-sm leading-relaxed text-foreground/85">{item.a}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
