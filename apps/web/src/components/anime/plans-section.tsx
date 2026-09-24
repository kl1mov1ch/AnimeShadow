import {
  ArrowRightIcon,
  CheckIcon,
  CrownIcon,
  type LucideIcon,
  MoonIcon,
  SwordIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { BladeScene, CrownScene, NightScene } from "@/components/anime/plan-scenes";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface Plan {
  key: "shadow" | "ronin" | "shogun";
  icon: LucideIcon;
  /** What moves behind this card — each tier has its own. */
  scene: ComponentType;
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
  { key: "shadow", icon: MoonIcon, scene: NightScene, price: "$0", period: "forever", perkCount: 3 },
  {
    key: "ronin",
    icon: SwordIcon,
    scene: BladeScene,
    price: "$4.99",
    period: "month",
    featured: true,
    perkCount: 4,
  },
  { key: "shogun", icon: CrownIcon, scene: CrownScene, price: "$9.99", period: "month", perkCount: 4 },
];

/**
 * The plans, at the foot of the homepage.
 *
 * Each tier has a scene of its own running behind the whole card — a night
 * sky for the shadow, a blade and falling petals for the rōnin, turning gold
 * rays and embers for the shōgun — so the three are told apart at a glance
 * by what they are, not only by their price. They used to share one
 * treatment with a different poster on top, which made the free tier and
 * the top tier look like the same product in two covers.
 */
export function PlansSection() {
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
        {PLANS.map((plan) => {
          const Scene = plan.scene;
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
                  : "border-border/60 bg-card hover:border-primary/40",
              )}
            >
              {/* The scene runs behind the whole card; the content sits on a
                  floor that rises out of it, so text stays readable over
                  whatever is moving. */}
              <Scene />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--card) 55%, transparent) 38%, var(--card) 62%)",
                }}
              />

              <div className="relative h-32 shrink-0">
                {plan.featured && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-lg shadow-primary/30">
                    {t("plans.popular")}
                  </span>
                )}

                <div className="absolute inset-x-5 bottom-3 flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-xl shadow-lg backdrop-blur-sm transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110",
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
                  "relative flex flex-1 flex-col p-5",
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
                    "group/cta btn-sheen mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300 active:scale-[0.98]",
                    plan.featured
                      ? "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/30"
                      : "border border-border/70 hover:border-primary/50 hover:text-primary",
                  )}
                >
                  {t(`plans.${plan.key}.cta` as "plans.shadow.cta")}
                  <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
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
