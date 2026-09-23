import type { AnimeSummary } from "@animeshadow/shared";
import {
  CheckIcon,
  CrownIcon,
  type LucideIcon,
  MoonIcon,
  SwordIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Plan {
  key: "shadow" | "ronin" | "shogun";
  icon: LucideIcon;
  price: string;
  period: string;
  featured?: boolean;
  perkCount: number;
}

/**
 * Three tiers, named after the site rather than after "basic/pro": a shadow
 * watching from the dark, a rōnin who answers to nobody, and the shōgun who
 * gets everything. Free, $4.99 and $9.99.
 */
const PLANS: Plan[] = [
  { key: "shadow", icon: MoonIcon, price: "$0", period: "forever", perkCount: 3 },
  {
    key: "ronin",
    icon: SwordIcon,
    price: "$4.99",
    period: "month",
    featured: true,
    perkCount: 4,
  },
  { key: "shogun", icon: CrownIcon, price: "$9.99", period: "month", perkCount: 4 },
];

/**
 * The plans, at the foot of the homepage. Each paid tier is headed by a
 * picture — a real title from the catalogue, so the offer is attached to
 * the thing being sold — while the free tier wears the mark of the site
 * itself: nothing is being sold there, so there is nothing to illustrate.
 *
 * The cards answer to the pointer: they lift, the picture drifts and
 * brightens, and a band of light crosses them.
 */
export function PlansSection({ art }: { art: AnimeSummary[] }) {
  const t = useT();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-tight sm:text-xl">
            {t("plans.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("plans.subtitle")}</p>
        </div>
        <Link
          to="/support"
          viewTransition
          className="text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          {t("plans.compare")} →
        </Link>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-3">
        {PLANS.map((plan, i) => {
          // The free tier is deliberately picture-less; the paid ones take
          // the next titles in the pool, so the two are never the same art.
          const backdrop = plan.key === "shadow" ? undefined : art[i - 1];
          const image = backdrop
            ? imageSrc(backdrop.imageLargeUrl ?? backdrop.imageUrl)
            : undefined;
          const perks = Array.from({ length: plan.perkCount }, (_, n) =>
            t(`plans.${plan.key}.perk${n + 1}` as "plans.shadow.perk1"),
          );

          return (
            <article
              key={plan.key}
              className={cn(
                "group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border transition-all duration-500 hover:-translate-y-2",
                plan.featured
                  ? "border-primary/60 bg-card shadow-xl shadow-primary/10 lg:-my-2"
                  : "border-border/60 bg-card/60 hover:border-primary/40",
              )}
            >
              {/* The picture at the head of the block. */}
              <div className="relative h-32 shrink-0 overflow-hidden">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="size-full scale-105 object-cover object-top opacity-80 transition-all duration-700 group-hover:scale-110 group-hover:opacity-100"
                  />
                ) : (
                  // No title to show for the free tier — the mark of the
                  // site stands in its place.
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center overflow-hidden bg-gradient-to-br from-primary/25 via-card to-card"
                  >
                    <LogoGlyph className="size-24 text-foreground/15 transition-transform duration-700 group-hover:scale-110" />
                    <LogoGlyph className="absolute -left-6 -top-6 size-20 -rotate-12 text-foreground/[0.06]" />
                    <LogoGlyph className="absolute -bottom-8 -right-6 size-28 rotate-6 text-foreground/[0.06]" />
                  </span>
                )}
                {/* The picture fades into the card rather than ending on a
                    hard edge. */}
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, color-mix(in srgb, var(--primary) 12%, transparent) 0%, transparent 35%, var(--card) 100%)",
                  }}
                />

                {plan.featured && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/30">
                    {t("plans.popular")}
                  </span>
                )}

                <div className="absolute inset-x-5 bottom-3 flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl backdrop-blur-sm transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110",
                      plan.featured
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/60 bg-background/70 text-primary",
                    )}
                  >
                    <plan.icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-base leading-tight">
                      {t(`plans.${plan.key}.name` as "plans.shadow.name")}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t(`plans.${plan.key}.note` as "plans.shadow.note")}
                    </span>
                  </span>
                </div>
              </div>

              {/* The band of light: one transform, one element. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[220%] -skew-x-12 bg-gradient-to-r from-transparent via-foreground/10 to-transparent transition-transform duration-700 ease-out will-change-transform group-hover:translate-x-[420%] motion-reduce:hidden"
              />

              <div
                className={cn(
                  "flex flex-1 flex-col p-5",
                  plan.featured && "lg:p-6 lg:pt-5",
                )}
              >
                <p className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "font-display text-4xl leading-none tabular-nums",
                      plan.featured && "text-primary",
                    )}
                  >
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.period === "forever"
                      ? t("plans.forever")
                      : t("plans.perMonth")}
                  </span>
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {perks.map((perk, n) => (
                    <li
                      key={perk}
                      style={{ transitionDelay: `${n * 40}ms` }}
                      className="flex items-start gap-2 text-sm text-foreground/85 transition-transform duration-300 group-hover:translate-x-0.5"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                          plan.featured
                            ? "bg-primary text-primary-foreground"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        <CheckIcon className="size-2.5" strokeWidth={3} />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/support"
                  viewTransition
                  className={cn(
                    "mt-7 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 active:scale-[0.98]",
                    plan.featured
                      ? "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/30"
                      : "border border-border/70 hover:border-primary/50 hover:text-primary",
                  )}
                >
                  {t(`plans.${plan.key}.cta` as "plans.shadow.cta")}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("plans.disclaimer")}
      </p>
    </section>
  );
}
