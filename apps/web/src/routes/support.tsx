import {
  CoffeeIcon,
  CrownIcon,
  ExternalLinkIcon,
  GemIcon,
  HeartIcon,
  HeartHandshakeIcon,
  type LucideIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { PlansSection } from "@/components/anime/plans-section";
import { PageHero, SectionTitle } from "@/components/common/page-hero";
import { ProMark } from "@/components/common/pro-mark";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { BOOSTY_URL } from "@/lib/support-links";

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

  const tips: Array<{ icon: LucideIcon; amount: number; name: string; perk: string }> = [
    { icon: CoffeeIcon, amount: 3, name: t("support.tiers.t1Name"), perk: t("support.tiers.t1Perk") },
    { icon: GemIcon, amount: 10, name: t("support.tiers.t2Name"), perk: t("support.tiers.t2Perk") },
    { icon: CrownIcon, amount: 25, name: t("support.tiers.t3Name"), perk: t("support.tiers.t3Perk") },
  ];

  const steps: Array<{ icon: LucideIcon; title: string; body: string }> = [
    { icon: HeartIcon, title: t("support.steps.pickTitle"), body: t("support.steps.pickBody") },
    { icon: MessageCircleIcon, title: t("support.steps.tellTitle"), body: t("support.boosty.proNote") },
    { icon: ShieldCheckIcon, title: t("support.steps.doneTitle"), body: t("support.steps.doneBody") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-5xl flex-col gap-8 py-4 sm:gap-12 sm:py-6">
      <div className="reveal" style={reveal(0)}>
        <PageHero
          icon={HeartHandshakeIcon}
          eyebrow={t("support.eyebrow")}
          title={t("support.title")}
          lead={t("support.lead")}
          aside={<SealPreview name={user?.displayName ?? t("support.previewName")} />}
        >
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href={BOOSTY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-sheen group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              <HeartIcon className="size-4 fill-current" />
              {t("support.boosty.cta")}
              <ExternalLinkIcon className="size-3.5 opacity-70" />
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
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* One-off tips — for anyone who wants to say thanks without a plan. */}
      <section
        className="reveal relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent p-5 shadow-xl shadow-primary/10 sm:p-7"
        style={reveal(3)}
      >
        <SectionTitle icon={HeartIcon} title={t("support.boosty.title")} note={t("support.boosty.body")} />
        <div className="grid gap-3 sm:grid-cols-3">
          {tips.map(({ icon: Icon, amount, name, perk }, i) => (
            <a
              key={amount}
              href={BOOSTY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
              className="btn-sheen group relative flex animate-in flex-col gap-2 overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-card/70 p-4 fade-in-0 zoom-in-95 duration-500 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg hover:shadow-primary/15"
            >
              <span className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="size-4" />
                </span>
                <span className="font-display text-2xl text-primary tabular-nums">${amount}+</span>
              </span>
              <span className="font-semibold">{name}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{perk}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

/** What PRO looks like where people will see it: the seal after a name. */
function SealPreview({ name }: { name: string }) {
  const t = useT();
  return (
    <div className="hidden w-64 flex-col gap-3 rounded-2xl border border-primary/30 bg-background/80 p-4 shadow-xl shadow-primary/15 md:flex">
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
