import type { CSSProperties } from "react";
import { CheckIcon, HeartIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function Component() {
  const t = useT();
  const [payOpen, setPayOpen] = useState(false);

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
    { name: t("support.tiers.t1Name"), amount: t("support.tiers.t1Amount"), perk: t("support.tiers.t1Perk") },
    { name: t("support.tiers.t2Name"), amount: t("support.tiers.t2Amount"), perk: t("support.tiers.t2Perk") },
    { name: t("support.tiers.t3Name"), amount: t("support.tiers.t3Amount"), perk: t("support.tiers.t3Perk") },
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

      {/* Plans */}
      <section
        className="reveal flex flex-col gap-4"
        style={{ "--i": 1 } as CSSProperties}
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
              <Button className="w-full" onClick={() => setPayOpen(true)}>
                {t("support.getPro")}
              </Button>
            }
          />
        </div>
      </section>

      {/* Sponsorship */}
      <section
        className="reveal flex flex-col gap-4"
        style={{ "--i": 2 } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <HeartIcon className="size-5 text-primary" />
          <h2 className="font-display text-xl">{t("support.donateTitle")}</h2>
        </div>
        <p className="max-w-prose text-muted-foreground">{t("support.donateBody")}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card/40 p-4"
            >
              <span className="font-display text-lg text-primary">{tier.amount}</span>
              <span className="font-medium">{tier.name}</span>
              <span className="text-sm text-muted-foreground">{tier.perk}</span>
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setPayOpen(true)}
        >
          <SparklesIcon className="size-4" />
          {t("support.donateCta")}
        </Button>
      </section>

      <Leaderboard />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("support.payDialog.title")}</DialogTitle>
            <DialogDescription>{t("support.payDialog.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setPayOpen(false)}>{t("support.payDialog.ok")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Top-patrons leaderboard. Fully built UI — table, filters, chart, private mode —
 * but there is no payment system yet, so it renders its empty state. Real rows
 * appear here once donations are wired up; nothing is fabricated.
 */
function Leaderboard() {
  const t = useT();
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");
  const [type, setType] = useState<"one" | "sub" | "all">("all");
  const [priv, setPriv] = useState(false);

  const rows: never[] = [];

  const seg = <T extends string>(
    value: T,
    set: (v: T) => void,
    opts: Array<[T, string]>,
  ) => (
    <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          aria-pressed={value === v}
          className={cn(
            "px-2.5 py-1 transition-colors",
            value === v
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <section
      className="reveal flex flex-col gap-4"
      style={{ "--i": 3 } as CSSProperties}
    >
      <h2 className="font-display text-xl">{t("support.leaderboard.title")}</h2>

      <div className="flex flex-wrap items-center gap-3">
        {seg(period, setPeriod, [
          ["week", t("support.leaderboard.periodWeek")],
          ["month", t("support.leaderboard.periodMonth")],
          ["all", t("support.leaderboard.periodAll")],
        ])}
        {seg(type, setType, [
          ["one", t("support.leaderboard.typeOneTime")],
          ["sub", t("support.leaderboard.typeSubscription")],
          ["all", t("support.leaderboard.typeAll")],
        ])}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={priv}
            onChange={(e) => setPriv(e.target.checked)}
            className="size-3.5 accent-[var(--color-primary)]"
          />
          {t("support.leaderboard.privateMode")}
        </label>
      </div>

      {/* chart */}
      {rows.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            {t("support.leaderboard.chartTitle")}
          </p>
          <div className="flex h-24 items-end gap-1.5 opacity-30">
            {rows.map((_row, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/40"
                style={{ height: `${8 + ((i * 37) % 80)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {t("support.leaderboard.colRank")}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t("support.leaderboard.colPatron")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("support.leaderboard.colTotal")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("support.leaderboard.colMonth")}
              </th>
              <th className="px-3 py-2 text-right font-medium">
                {t("support.leaderboard.colBadge")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {t("support.leaderboard.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
