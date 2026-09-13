import type { CSSProperties } from "react";
import { CheckIcon, ExternalLinkIcon, HeartIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { BOOSTY_URL } from "@/lib/support-links";
import { cn } from "@/lib/utils";

/**
 * One-off tips and PRO both route to the same place: Boosty. We never touch
 * payment details ourselves, so there's nothing to build here beyond a clear
 * link out and an honest note about what happens after — PRO isn't granted
 * automatically (no webhook from Boosty into the backend yet), so it's a
 * manual flip once someone's subscription shows up on our end.
 */
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
    <div className="reveal-group mx-auto flex max-w-4xl flex-col gap-12 py-8">
      <header className="reveal flex flex-col gap-3" style={{ "--i": 0 } as CSSProperties}>
        <span aria-hidden className="font-display text-4xl text-primary">
          影
        </span>
        <h1 className="font-display text-3xl sm:text-4xl">{t("support.title")}</h1>
        <p className="max-w-prose text-lg text-muted-foreground">{t("support.lead")}</p>
      </header>

      {/* Boosty — the one real place any of this actually goes. */}
      <section
        className="reveal relative overflow-hidden rounded-2xl border border-primary/40 bg-primary/[0.06] p-6 shadow-[0_0_50px_-16px] shadow-primary/30 sm:p-8"
        style={{ "--i": 1 } as CSSProperties}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <HeartIcon className="size-5 text-primary" />
            <h2 className="font-display text-xl">{t("support.boosty.title")}</h2>
          </div>
          <p className="max-w-prose text-muted-foreground">{t("support.boosty.body")}</p>

          <div className="flex flex-wrap gap-3 sm:gap-4">
            {tiers.map((tier) => (
              <div
                key={tier.amount}
                className="flex flex-col items-start gap-0.5 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5"
              >
                <span className="font-display text-lg">${tier.amount}+</span>
                <span className="text-xs font-medium text-foreground/90">{tier.name}</span>
                <span className="text-xs text-muted-foreground">{tier.perk}</span>
              </div>
            ))}
          </div>

          <Button size="lg" className="self-start" asChild>
            <a href={BOOSTY_URL} target="_blank" rel="noopener noreferrer">
              <HeartIcon className="size-4" />
              {t("support.boosty.cta")}
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </Button>
          <p className="text-xs text-muted-foreground/80">{t("support.boosty.proNote")}</p>
        </div>
      </section>

      {/* Plans — informational; the actual subscribe action is the same Boosty link above. */}
      <section
        className="reveal flex flex-col gap-4"
        style={{ "--i": 2 } as CSSProperties}
      >
        <h2 className="font-display text-xl">{t("support.plansTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            name={t("support.free.name")}
            price={t("support.free.price")}
            period={t("support.free.period")}
            tagline={t("support.free.tagline")}
            features={freeFeatures}
            cta={
              <Button variant="outline" className="w-full" disabled>
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
              <Button className="w-full" asChild>
                <a href={BOOSTY_URL} target="_blank" rel="noopener noreferrer">
                  {t("support.getPro")}
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
        "relative flex flex-col gap-5 rounded-2xl border p-6",
        highlight
          ? "border-primary/50 bg-primary/[0.06] shadow-[0_0_40px_-12px] shadow-primary/25"
          : "border-border/60 bg-card/40",
      )}
    >
      {badge && (
        <Badge className="absolute -top-2.5 right-5 bg-primary text-primary-foreground">
          {badge}
        </Badge>
      )}
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg">{name}</span>
        <div className="flex items-baseline gap-1">
          <span className="font-display text-3xl">{price}</span>
          {period && <span className="text-sm text-muted-foreground">{period}</span>}
        </div>
        <span className="text-sm text-muted-foreground">{tagline}</span>
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckIcon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                highlight ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">{cta}</div>
    </div>
  );
}
