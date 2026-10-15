import { formatUsd, PRO_PLANS, type ProPlan, proPlanMath } from "@animeshadow/shared";
import { ArrowRightIcon, CheckIcon, CrownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

const PERKS = 5;

/**
 * PRO: what it gives, once, and three lengths to take it for — a month,
 * three months, a year — each cheaper per month than the last, with what it
 * saves said on the card. The year is marked as the best deal.
 */
export function PlansSection({
  ctaHref,
  showCompare = true,
}: {
  /** Where the buttons go when not to /support — the support page itself
   *  sends them straight out to payment. */
  ctaHref?: string;
  showCompare?: boolean;
} = {}) {
  const t = useT();
  const perks = Array.from({ length: PERKS }, (_, n) => t(`plans.perks.p${n + 1}` as "plans.perks.p1"));
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-tight sm:text-xl">{t("plans.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("plans.subtitle")}</p>
        </div>
        {showCompare && (
          <Link to="/support" viewTransition className="text-sm text-muted-foreground transition-colors hover:text-primary">
            {t("plans.compare")} →
          </Link>
        )}
      </div>

      {/* What PRO gives — the same for every length. */}
      <ul className="grid gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-card/40 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm text-foreground/85">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="size-2.5" strokeWidth={3} />
            </span>
            {perk}
          </li>
        ))}
      </ul>

      <div className="grid items-stretch gap-3 sm:grid-cols-3 sm:gap-4">
        {PRO_PLANS.map((plan) => (
          <PlanCard key={plan.months} plan={plan} ctaHref={ctaHref} />
        ))}
      </div>

      {!ctaHref && <p className="text-center text-xs text-muted-foreground">{t("plans.disclaimer")}</p>}
    </section>
  );
}

function PlanCard({ plan, ctaHref }: { plan: ProPlan; ctaHref?: string }) {
  const t = useT();
  const { perMonth, save } = proPlanMath(plan);
  const best = plan.months === 12;
  const period = t(`plans.months.m${plan.months}` as "plans.months.m1");
  return (
    <article
      className={cn(
        "group relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card/50 p-5 transition-colors duration-300",
        best ? "border-primary/60 bg-[radial-gradient(120%_100%_at_100%_0%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_60%)]" : "border-border/60 hover:border-foreground/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cn("grid size-9 place-items-center rounded-xl", best ? "bg-primary text-primary-foreground" : "bg-foreground/[0.06] text-primary")}>
            <CrownIcon className="size-4.5" />
          </span>
          <span className="font-display text-base leading-tight">{period}</span>
        </span>
        {best ? (
          <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-lg">
            {t("plans.best")}
          </span>
        ) : save > 0 ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">−{save}%</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span className={cn("font-display text-4xl leading-none tabular-nums", best && "text-primary")}>{formatUsd(plan.usd)}</span>
          {save > 0 && (
            <s className="text-sm tabular-nums text-muted-foreground">{formatUsd(Math.round(proPlanMath(PRO_PLANS[0]).perMonth * plan.months * 100) / 100)}</s>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {plan.months === 1
            ? t("plans.monthly")
            : t("plans.perMonthIs", { price: formatUsd(perMonth) }) + (save > 0 ? ` · ${t("plans.save", { n: save })}` : "")}
        </p>
      </div>

      <CtaLink
        href={ctaHref}
        className={cn(
          "group/cta mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300 active:scale-[0.98]",
          best ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50" : "border border-border/70 hover:border-primary/50 hover:text-primary",
        )}
      >
        {t("plans.cta", { period: period.toLowerCase() })}
        <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
      </CtaLink>
    </article>
  );
}

function CtaLink({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to="/support" viewTransition className={className}>
      {children}
    </Link>
  );
}
