import { formatUsd, PROMO, type PromoState, promoRoundEnd, promoSecondMonthUsd } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CrownIcon, GiftIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { BOOSTY_URL } from "@/lib/support-links";
import { cn } from "@/lib/utils";

/** Where the signed-in account stands with the welcome offer. */
export function usePromo() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["me", "promo"],
    queryFn: ({ signal }) => apiRequest<PromoState>("/promo", { signal }),
    enabled: status === "authenticated",
    staleTime: 5 * 60_000,
  });
}

export function useClaimPromo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<PromoState>("/promo/claim", { method: "POST" }),
    onSuccess: (state) => {
      client.setQueryData(["me", "promo"], state);
      void client.invalidateQueries({ queryKey: ["me", "profile"] });
    },
  });
}

/** Days, hours, minutes and seconds left until a moment, ticking. */
function useCountdown(until: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = Math.max(0, until.getTime() - now);
  return {
    d: Math.floor(left / 86_400_000),
    h: Math.floor(left / 3_600_000) % 24,
    m: Math.floor(left / 60_000) % 60,
    s: Math.floor(left / 1000) % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "29д 12:03:44" in small tiles. */
export function PromoTimer({ until, className }: { until: Date; className?: string }) {
  const { d, h, m, s } = useCountdown(until);
  const tile = "rounded-md bg-background/70 px-1.5 py-0.5 font-semibold tabular-nums text-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] text-muted-foreground", className)} aria-label="До конца акции">
      <span className={tile}>{d}д</span>
      <span className={tile}>{pad(h)}</span>:<span className={tile}>{pad(m)}</span>:<span className={tile}>{pad(s)}</span>
    </span>
  );
}

/**
 * The offer as one line for guests' invites: a gift, "first month of PRO
 * free, second −50%", and the timer to the end of this round.
 */
export function PromoStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 overflow-hidden rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-400/15 via-primary/10 to-fuchsia-500/15 px-3 py-2",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-[12.5px] leading-tight">
        <GiftIcon className="size-4 shrink-0 text-amber-300" />
        <span>
          <b className="font-semibold text-amber-200">Месяц PRO бесплатно</b>
          <span className="text-foreground/75"> · второй −{PROMO.discountPercent}%</span>
        </span>
      </span>
      <PromoTimer until={promoRoundEnd()} />
    </div>
  );
}

/**
 * The offer for a signed-in account, by where it stands: take the free month
 * (accounts made before the offer, once), the free month running, or the
 * half-price second month on offer — each with its timer. Nothing once the
 * offer is used or the account is PRO for good.
 */
export function PromoCard({ className }: { className?: string }) {
  const { data } = usePromo();
  const claim = useClaimPromo();
  if (!data || data.phase === "used" || (data.phase === "pro" && !data.proUntil)) return null;

  const wrap = cn(
    "relative isolate flex flex-col gap-3 overflow-hidden rounded-2xl border border-amber-300/30 bg-[radial-gradient(120%_120%_at_0%_0%,rgb(251_191_36/0.18),transparent_55%),radial-gradient(120%_120%_at_100%_100%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_55%)] p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5",
    className,
  );
  const icon = (
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/30">
      {data.phase === "trial" ? <CrownIcon className="size-6" /> : <GiftIcon className="size-6" />}
    </span>
  );

  if (data.phase === "pro" && data.proUntil) {
    const soon = new Date(data.proUntil).getTime() - Date.now() < 7 * 86_400_000;
    return (
      <section className={wrap}>
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-lg leading-tight">PRO активен 👑</p>
          <p className="text-sm text-foreground/75">
            Действует до {new Date(data.proUntil).toLocaleDateString("ru", { day: "numeric", month: "long" })} — потом выключится сам.
            {soon ? " Осталось меньше недели — самое время продлить." : ""}
          </p>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Осталось <PromoTimer until={new Date(data.proUntil)} />
          </span>
        </div>
        <a
          href={BOOSTY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/10 px-5 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-400/20"
        >
          <CrownIcon className="size-4" />
          Продлить
        </a>
      </section>
    );
  }

  if (data.phase === "claimable") {
    return (
      <section className={wrap}>
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-display text-lg leading-tight">Месяц PRO — в подарок 🎁</p>
          <p className="text-sm text-foreground/75">
            Забери бесплатный месяц: безлимитный список, значок 影, свои подписи и всё PRO. Второй месяц потом — за {formatUsd(promoSecondMonthUsd())} вместо {formatUsd(PROMO.proMonthlyUsd)}. Акция одна на аккаунт.
          </p>
        </div>
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() =>
            claim.mutate(undefined, {
              onSuccess: () => toast.success("PRO включён на 30 дней! 👑", { description: "Подарочный месяц уже действует" }),
              onError: (e) => toast.error("Не получилось", { description: e instanceof ApiRequestError ? e.message : "Попробуйте ещё раз" }),
            })
          }
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-primary to-fuchsia-500 px-5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95 disabled:opacity-60"
        >
          <SparklesIcon className="size-4" />
          Забрать месяц
        </button>
      </section>
    );
  }

  if (data.phase === "trial" && data.trialUntil) {
    return (
      <section className={wrap}>
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-lg leading-tight">Подарочный PRO активен 👑</p>
          <p className="text-sm text-foreground/75">
            Потом второй месяц — за {formatUsd(promoSecondMonthUsd())} вместо {formatUsd(PROMO.proMonthlyUsd)}, скидка {PROMO.discountPercent}% держится 30 дней.
          </p>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Осталось <PromoTimer until={new Date(data.trialUntil)} />
          </span>
        </div>
      </section>
    );
  }

  if (data.phase === "discount" && data.discountUntil) {
    return (
      <section className={wrap}>
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-lg leading-tight">
            Второй месяц PRO — <span className="text-amber-200">{formatUsd(promoSecondMonthUsd())}</span>{" "}
            <s className="text-sm text-muted-foreground">{formatUsd(PROMO.proMonthlyUsd)}</s>
          </p>
          <p className="text-sm text-foreground/75">Подарочный месяц закончился — продли PRO со скидкой {PROMO.discountPercent}%, пока идёт таймер.</p>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            Скидка сгорит через <PromoTimer until={new Date(data.discountUntil)} />
          </span>
        </div>
        <a
          href={BOOSTY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-primary to-fuchsia-500 px-5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
        >
          <CrownIcon className="size-4" />
          Продлить со скидкой
        </a>
      </section>
    );
  }
  return null;
}
