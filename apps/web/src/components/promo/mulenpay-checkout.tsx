import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCardIcon, Loader2Icon } from "lucide-react";
import { useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LEGAL_VERSION } from "@animeshadow/shared";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";

type Quote = { months: number; amountMinor: number; currency: string; discountPercent: number };

export function MulenPayCheckout({ consent }: { consent: boolean }) {
  const { status } = useAuth();
  const member = status === "authenticated";
  const client = useQueryClient();
  const requestIds = useRef(new Map<number, string>());
  const [params] = useSearchParams();
  const returnedId = params.get("payment");
  const paymentId = returnedId && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(returnedId) ? returnedId : null;
  const { data, isPending, isError } = useQuery({
    queryKey: ["payment-plans", member], staleTime: 60_000,
    queryFn: ({ signal }) => apiRequest<{ available: boolean; plans: Quote[] }>("/payments/plans", { signal }),
  });
  const check = useQuery({
    queryKey: ["payment-status", paymentId], enabled: Boolean(paymentId && member),
    queryFn: async ({ signal }) => {
      const result = await apiRequest<{ status: string }>(`/payments/${paymentId}`, { signal });
      if (result.status === "paid") {
        void client.invalidateQueries({ queryKey: ["me", "promo"] });
        void client.invalidateQueries({ queryKey: ["me", "profile"] });
      }
      return result;
    },
    refetchInterval: (query) => query.state.data?.status === "pending" && query.state.dataUpdateCount < 24 ? 5000 : false,
  });
  const checkout = useMutation({
    mutationFn: async (quote: Quote) => {
      let requestId = requestIds.current.get(quote.months);
      if (!requestId) { requestId = crypto.randomUUID(); requestIds.current.set(quote.months, requestId); }
      return apiRequest<{ paymentUrl: string }>("/payments", { method: "POST", body: { months: quote.months, expectedAmountMinor: quote.amountMinor, requestId, consent: true, consentVersion: LEGAL_VERSION } });
    },
    onSuccess: (result) => window.location.assign(result.paymentUrl),
  });
  return <section className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-7">
    <h2 className="flex items-center gap-2 font-display text-xl"><CreditCardIcon className="size-5 text-primary" />Оплата через Mulen Pay</h2>
    {paymentId && <div className="mt-3 rounded-xl bg-secondary/40 p-3 text-sm" role="status">
      {check.data?.status === "paid" ? "Оплата подтверждена. PRO активирован." : check.isError ? "Не удалось проверить оплату. Повторите проверку или обратитесь в поддержку." : check.data?.status === "cancelled" ? "Платёж отменён. Списания не подтверждены." : check.data?.status === "failed" ? "Платёж не прошёл. Можно выбрать другой способ оплаты." : check.data?.status === "creating" ? "Счёт создаётся. Проверьте статус перед повторной оплатой." : "Проверяем оплату на стороне платёжного сервиса…"}
      {member && check.data?.status !== "paid" && <button type="button" onClick={() => void check.refetch()} disabled={check.isFetching} className="mt-2 block text-primary underline disabled:opacity-50">Проверить статус</button>}
      {!member && <Link to="/login" className="mt-2 block text-primary">Войти для проверки оплаты</Link>}
    </div>}
    {isPending ? <p className="mt-2 text-sm text-muted-foreground">Загружаем способы оплаты…</p>
      : isError ? <p className="mt-2 text-sm text-muted-foreground">Не удалось получить способы оплаты. Ссылки Boosty выше доступны.</p>
      : !data?.available ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Этот способ оплаты готовится к подключению. Пока поддержать проект можно через Boosty.</p>
      : <>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Оплата в рублях на странице платёжного сервиса. PRO включится после подтверждения оплаты, без автопродления.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{data.plans.map((plan) => <div key={plan.months} className="rounded-xl border border-border/60 p-4">
          <p className="text-sm">{plan.months === 1 ? "1 месяц" : plan.months === 3 ? "3 месяца" : "12 месяцев"}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(plan.amountMinor / 100)}</p>
          {plan.discountPercent > 0 && <p className="mt-1 text-xs text-primary">Ваша скидка {plan.discountPercent}%</p>}
          {member ? <button type="button" disabled={!consent || checkout.isPending} onClick={() => checkout.mutate(plan)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {checkout.isPending && <Loader2Icon className="size-4 animate-spin" />}Оплатить через Mulen Pay
          </button> : <Link to="/register" className="mt-3 inline-flex min-h-10 items-center text-sm text-primary">Создать аккаунт для PRO</Link>}
        </div>)}</div>
        {member && !consent && <p className="mt-3 text-xs text-muted-foreground">Отметьте согласие с условиями оплаты в начале страницы.</p>}
        {checkout.error && <p role="alert" className="mt-3 text-sm text-rose-400">{checkout.error.message}</p>}
      </>}
  </section>;
}
