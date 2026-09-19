import type { CSSProperties } from "react";
import { CheckIcon, ExternalLinkIcon, HeartIcon, SparklesIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { BOOSTY_URL } from "@/lib/support-links";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

/**
 * One-off tips and PRO both route to the same place: Boosty. We never touch
 * payment details ourselves, so there's nothing to build here beyond a clear
 * link out and an honest note about what happens after — PRO isn't granted
 * automatically (no webhook from Boosty into the backend yet), so it's a
 * manual flip once someone's subscription shows up on our end.
 *
 * The page's job is to make that worth doing without overclaiming. Every
 * number and perk on it is one the site actually delivers; the persuasion is
 * in the presentation, not in the promises.
 */

/** The band of light every deliberate action on this site sweeps on hover. */
function Sheen({ tone = "light" }: { tone?: "primary" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
        tone === "light" ? "via-white/40" : "via-primary/30",
      )}
    />
  );
}

export function Component() {
  const t = useT();

  const freeFeatures = [
    t("support.feat.catalog"),
    t("support.feat.list"),
    t("support.feat.progress"),
    t("support.feat.reviews"),
  ];
  const proFeatures = [
    t("support.feat.resume"),
    t("support.feat.unlimited"),
    t("support.feat.hd"),
    t("support.feat.badge"),
    t("support.feat.early"),
  ];

  const tiers = [
    { amount: 3, name: t("support.tiers.t1Name"), perk: t("support.tiers.t1Perk") },
    { amount: 10, name: t("support.tiers.t2Name"), perk: t("support.tiers.t2Perk") },
    { amount: 25, name: t("support.tiers.t3Name"), perk: t("support.tiers.t3Perk") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-10 py-8 sm:gap-14">
      <header
        className="reveal relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-card/40 px-5 py-10 text-center sm:px-8 sm:py-14"
        style={{ "--i": 0 } as CSSProperties}
      >
        {/* The site mark as a watermark rather than a bullet point — the same
            move the profile charts make, so the page reads as ours on sight. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-10 select-none font-display text-[10rem] leading-none text-primary/[0.06] sm:text-[14rem]"
        >
          <SlicedGlyph />
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />

        <span className="relative font-display text-5xl text-primary"><SlicedGlyph /></span>
        <h1 className="relative font-display text-3xl sm:text-4xl">{t("support.title")}</h1>
        <p className="relative max-w-prose text-lg text-muted-foreground">
          {t("support.lead")}
        </p>

        <Button
          size="lg"
          className="group relative mt-1 overflow-hidden rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary px-6 font-semibold shadow-lg shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40"
          asChild
        >
          <a href={BOOSTY_URL} target="_blank" rel="noopener noreferrer">
            <HeartIcon className="relative z-10 fill-current" />
            <span className="relative z-10">{t("support.boosty.cta")}</span>
            <ExternalLinkIcon className="relative z-10 size-3.5 opacity-70" />
            <Sheen />
          </a>
        </Button>
      </header>

      {/* Boosty — the one real place any of this actually goes. */}
      <section
        className="reveal relative overflow-hidden rounded-3xl border border-primary/40 bg-primary/[0.06] p-6 shadow-[0_0_60px_-20px] shadow-primary/30 sm:p-8"
        style={{ "--i": 1 } as CSSProperties}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <HeartIcon className="size-5 text-primary" />
            <h2 className="font-display text-xl">{t("support.boosty.title")}</h2>
          </div>
          <p className="max-w-prose text-muted-foreground">{t("support.boosty.body")}</p>

          <div className="grid gap-3 sm:grid-cols-3">
            {tiers.map((tier, i) => (
              <div
                key={tier.amount}
                style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
                className="animate-in fade-in zoom-in-95 group relative flex flex-col items-start gap-0.5 overflow-hidden rounded-2xl border border-border/60 bg-card/50 px-4 py-3 duration-500 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
              >
                <span className="relative z-10 font-display text-xl text-primary">
                  ${tier.amount}+
                </span>
                <span className="relative z-10 text-sm font-medium text-foreground/90">
                  {tier.name}
                </span>
                <span className="relative z-10 text-xs text-muted-foreground">{tier.perk}</span>
                <Sheen tone="primary" />
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/80">{t("support.boosty.proNote")}</p>
        </div>
      </section>

      {/* Plans — informational; the actual subscribe action is the same Boosty link above. */}
      <section className="reveal flex flex-col gap-5" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("support.plansTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            name={t("support.free.name")}
            price={t("support.free.price")}
            period={t("support.free.period")}
            tagline={t("support.free.tagline")}
            features={freeFeatures}
            cta={
              <Button variant="outline" className="w-full rounded-full" disabled>
                {t("support.currentPlan")}
              </Button>
            }
          />
          <PlanCard
            highlight
            badge={t("support.pro.badge")}
            name={t("support.pro.name")}
            price={t("support.pro.price")}
            period={t("support.pro.period")}
            tagline={t("support.pro.tagline")}
            features={proFeatures}
            cta={
              <Button
                className="group relative w-full overflow-hidden rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-md shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/40"
                asChild
              >
                <a href={BOOSTY_URL} target="_blank" rel="noopener noreferrer">
                  <SparklesIcon className="relative z-10" />
                  <span className="relative z-10">{t("support.getPro")}</span>
                  <Sheen />
                </a>
              </Button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function PlanCard({
  name,
  price,
  period,
  tagline,
  features,
  cta,
  highlight = false,
  badge,
}: {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-5 rounded-2xl border p-6 transition-all duration-300",
        highlight
          ? "border-primary/50 bg-primary/[0.06] shadow-[0_0_50px_-16px] shadow-primary/25 hover:-translate-y-1 hover:shadow-[0_0_60px_-12px] hover:shadow-primary/35"
          : "border-border/60 bg-card/40 hover:-translate-y-0.5 hover:border-border",
      )}
    >
      {badge && (
        <Badge className="absolute -top-2.5 right-5 bg-gradient-to-r from-primary via-primary/85 to-primary text-primary-foreground shadow-md shadow-primary/30">
          {badge}
        </Badge>
      )}
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg">{name}</span>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-display text-3xl",
              highlight &&
                "bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent",
            )}
          >
            {price}
          </span>
          {period && <span className="text-sm text-muted-foreground">{period}</span>}
        </div>
        <span className="text-sm text-muted-foreground">{tagline}</span>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {features.map((f, i) => (
          <li
            key={f}
            style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
            className="animate-in fade-in slide-in-from-left-2 flex items-start gap-2 duration-500"
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                highlight ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              <CheckIcon className="size-3" />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">{cta}</div>
    </div>
  );
}
