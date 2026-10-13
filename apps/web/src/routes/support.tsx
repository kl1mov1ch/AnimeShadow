import { CoffeeIcon, ExternalLinkIcon, HeartHandshakeIcon, HeartIcon, type LucideIcon, MessageCircleIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { ReactionGif } from "@/components/common/reaction-gif";
import { PlansSection } from "@/components/anime/plans-section";
import { PageHero, SectionTitle } from "@/components/common/page-hero";
import { ProMark } from "@/components/common/pro-mark";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { BOOSTY_URL, donateHref } from "@/lib/support-links";
import { cn } from "@/lib/utils";
import { PromoCard } from "@/components/promo/promo-offer";

const reveal = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * One-off tips and the paid tiers both go to the same place: Boosty. We
 * never touch payment details ourselves; PRO is switched on by hand once a
 * subscription shows up, and the page says so.
 *
 * The tiers are the same three the homepage shows — shadow, rōnin, shōgun,
 * each with its own moving scene — instead of a separate "free / PRO" pair
 * with different prices, so the two pages no longer disagree about what
 * the site sells. Every perk on it is one the site actually delivers.
 */
export function Component() {
  const t = useT();
  const { user } = useAuth();
  // The gif in the corner cheers up when the pointer is on a support button.
  const [happy, setHappy] = useState(false);
  const cheer = { onMouseEnter: () => setHappy(true), onMouseLeave: () => setHappy(false), onFocus: () => setHappy(true), onBlur: () => setHappy(false) };


  const steps: Array<{ icon: LucideIcon; title: string; body: string }> = [
    { icon: HeartIcon, title: t("support.steps.pickTitle"), body: t("support.steps.pickBody") },
    { icon: MessageCircleIcon, title: t("support.steps.tellTitle"), body: t("support.boosty.proNote") },
    { icon: ShieldCheckIcon, title: t("support.steps.doneTitle"), body: t("support.steps.doneBody") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-5xl flex-col gap-8 py-4 sm:gap-12 sm:py-6">
      <PromoCard className="reveal" />
      <div className="reveal" style={reveal(0)}>
        <PageHero
          icon={HeartHandshakeIcon}
          eyebrow={t("support.eyebrow")}
          title={t("support.title")}
          lead={t("support.lead")}
          aside={<AskingCard happy={happy} />}
        >
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={BOOSTY_URL}
              target="_blank"
              rel="noopener noreferrer"
              {...cheer}
              className="group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              <HeartIcon className="size-4 fill-current" />
              {t("support.boosty.cta")}
              <ExternalLinkIcon className="size-3.5 opacity-70" />
            </a>
            <a
              href={donateHref()}
              target="_blank"
              rel="noopener noreferrer"
              {...cheer}
              className="group inline-flex h-11 items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/10 px-5 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/20"
            >
              <CoffeeIcon className="size-4 text-amber-300 transition-transform group-hover:-rotate-12" />
              Угостить кофе
            </a>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="size-3.5 text-primary" />
              {t("support.safeNote")}
            </span>
          </div>
        </PageHero>
      </div>

      <div className="reveal" style={reveal(1)}>
        <PlansSection ctaHref={BOOSTY_URL} showCompare={false} />
      </div>

      {/* How PRO actually gets switched on — said plainly, since it is by hand. */}
      <section className="reveal flex flex-col gap-4" style={reveal(2)}>
        <SectionTitle icon={SparklesIcon} title={t("support.steps.title")} />
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-5 select-none font-display text-7xl leading-none text-primary/[0.08]"
              >
                {i + 1}
              </span>
              <span className="grid size-10 place-items-center rounded-xl bg-foreground/[0.06] text-foreground/80">
                <Icon className="size-5" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* One-off thanks, picked like coffee: a slider of cups, and the face
          beside it gets happier the more there are. */}
      <TipPicker cheer={cheer} />

      <div className="reveal" style={reveal(4)}>
        <SealPreview name={user?.displayName ?? t("support.previewName")} wide />
      </div>
    </div>
  );
}

/** What PRO looks like where people will see it: the seal after a name. */
function SealPreview({ name, wide = false }: { name: string; wide?: boolean }) {
  const t = useT();
  return (
    <div className={cn("flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-xl", wide ? "flex" : "hidden w-64 md:flex")}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("support.previewTitle")}
      </span>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-lg text-primary ring-2 ring-primary/50 ring-offset-2 ring-offset-background">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-lg font-bold tracking-tight">
          <span className="truncate">{name}</span>
          <ProMark />
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("support.previewBody")}</p>
    </div>
  );
}

/** The hero's face: a gif that asks — and smiles when a support button is pointed at. */
function AskingCard({ happy }: { happy: boolean }) {
  return (
    <div className="hidden w-60 flex-col items-center gap-3 md:flex">
      <div className="relative w-full">
        <ReactionGif category={happy ? "happy" : "pout"} className="aspect-square w-full shadow-xl shadow-black/30" />
        <span className="absolute -bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--accent-line-soft)] bg-card px-3 py-1 text-xs font-semibold shadow-lg">
          <HeartIcon className={cn("size-3 text-primary", happy && "fill-current")} />
          {happy ? "Спасибо!!" : "Поддержишь нас?"}
        </span>
      </div>
    </div>
  );
}

const CUPS = [
  { at: 1, gif: "smile", word: "Одна чашка — уже приятно" },
  { at: 3, gif: "blush", word: "О, на целый вечер кода!" },
  { at: 6, gif: "happy", word: "Хватит на неделю хостинга" },
  { at: 12, gif: "dance", word: "Это праздник для сервера" },
  { at: 20, gif: "hug", word: "Мы вас обнимаем. Правда." },
];

/** "How many coffees?" — a slider from one to twenty, a dollar each. */
function TipPicker({ cheer }: { cheer: Record<string, () => void> }) {
  const [cups, setCups] = useState(3);
  const stage = [...CUPS].reverse().find((c) => cups >= c.at) ?? CUPS[0]!;
  return (
    <section className="reveal grid items-center gap-6 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-7" style={reveal(3)}>
      <ReactionGif category={stage.gif} className="mx-auto aspect-square w-32 sm:w-40" />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <CoffeeIcon className="size-5 text-primary" />
            Угостите нас кофе
          </h2>
          <p className="text-sm text-muted-foreground">Разово, без подписки — сколько не жалко. Каждый доллар идёт на сервер и плееры.</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <span className="font-display text-4xl leading-none tabular-nums">
            ${cups}
            <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-base text-amber-300/90">
              {Array.from({ length: Math.min(cups, 6) }, (_, i) => (
                <CoffeeIcon key={i} className="size-4" />
              ))}
              {cups > 6 && <span className="ml-1 text-muted-foreground">×{cups}</span>}
            </span>
          </span>
          <span key={stage.word} className="animate-in text-sm font-medium text-foreground/85 duration-300 fade-in-0">{stage.word}</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={cups}
          onChange={(e) => setCups(Number(e.target.value))}
          aria-label="Сколько чашек кофе"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-foreground/10 accent-[var(--primary)]"
        />
        <div className="flex flex-wrap gap-2">
          {[1, 3, 5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCups(n)}
              className={cn(
                "h-8 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors",
                cups === n ? "border-primary bg-primary/15 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              ${n}
            </button>
          ))}
          <a
            href={donateHref(cups)}
            target="_blank"
            rel="noopener noreferrer"
            {...cheer}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <CoffeeIcon className="size-4" />
            Угостить на ${cups}
          </a>
        </div>
      </div>
    </section>
  );
}
