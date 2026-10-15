import { CheckIcon, ExternalLinkIcon, ShieldCheckIcon } from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { givePayConsent, payConsentGiven, useLegalOperator } from "@/lib/legal";
import { cn } from "@/lib/utils";
import { LegalLink } from "./legal-doc";

/**
 * The consent box under a form: «Я принимаю Соглашение и Политику и даю
 * согласие на обработку данных» — each document opens in a modal. Not
 * ticked by default: consent has to be given, not assumed.
 */
export function ConsentCheck({
  checked,
  onChange,
  invalid,
  kind,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
  kind: "register" | "pay";
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed transition-colors",
        invalid ? "border-rose-500/60 bg-rose-500/[0.06]" : "border-[var(--accent-line-soft)] bg-foreground/[0.02]",
        className,
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          checked ? "border-primary bg-primary text-primary-foreground" : invalid ? "border-rose-500" : "border-foreground/30",
        )}
      >
        {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="text-muted-foreground">
        {kind === "pay" ? "Я принимаю условия " : "Я принимаю "}
        <LegalLink id="terms">{kind === "pay" ? "Пользовательского соглашения (оферты)" : "Пользовательское соглашение"}</LegalLink>
        {kind === "pay" ? ", включая порядок возврата, " : ", "}
        <LegalLink id="privacy">Политику конфиденциальности</LegalLink> и даю{" "}
        <LegalLink id="consent">согласие на обработку персональных данных</LegalLink>
        {kind === "register" ? ". Мне есть 14\u00a0лет." : "."}
      </span>
    </label>
  );
}

/** Links that lead to payment: Boosty, the tip jar, MulenPay. */
function payTarget(target: EventTarget): HTMLAnchorElement | null {
  const a = (target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a) return null;
  if (a.dataset.pay != null) return a;
  try {
    const host = new URL(a.href).hostname;
    return /(^|\.)(boosty\.to|mulenpay\.(com|ru)|donationalerts\.com|cloudtips\.ru|yoomoney\.ru)$/.test(host) ? a : null;
  } catch {
    return null;
  }
}

/**
 * Wraps a page with payment links: until the terms are accepted (in this
 * browser, for this edition), a click on any of them opens a short "before
 * you pay" window with the consent box first — then goes on to pay.
 */
export function usePayConsent() {
  const [accepted, setAccepted] = useState(payConsentGiven);
  const [pending, setPending] = useState<string | null>(null);

  const accept = useCallback((value: boolean) => {
    if (value) givePayConsent();
    setAccepted(value);
  }, []);

  const onClickCapture = useCallback(
    (e: MouseEvent) => {
      if (accepted) return;
      const a = payTarget(e.target);
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(a.href);
    },
    [accepted],
  );

  const dialog = (
    <PayConsentDialog
      href={pending}
      onClose={() => setPending(null)}
      onAccept={() => {
        accept(true);
        if (pending) window.open(pending, "_blank", "noopener,noreferrer");
        setPending(null);
      }}
    />
  );
  return { accepted, accept, onClickCapture, dialog };
}

function PayConsentDialog({ href, onClose, onAccept }: { href: string | null; onClose: () => void; onAccept: () => void }) {
  const operator = useLegalOperator();
  const [checked, setChecked] = useState(false);
  const [invalid, setInvalid] = useState(false);
  return (
    <Dialog open={href != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="gap-4 p-5 sm:max-w-md">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheckIcon className="size-5" />
          </span>
          <div>
            <DialogTitle className="font-display text-lg leading-tight">Перед оплатой</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              Оплату принимает защищённая страница платёжного сервиса{operator.paymentsName ? ` (${operator.paymentsName})` : ""} — данные карты сайт не видит. Деньги за PRO можно вернуть: полностью до активации и за неиспользованные дни — после.
            </DialogDescription>
          </div>
        </div>
        <ConsentCheck
          kind="pay"
          checked={checked}
          invalid={invalid}
          onChange={(v) => {
            setChecked(v);
            setInvalid(false);
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 flex-1 rounded-xl border border-[var(--accent-line-soft)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => (checked ? onAccept() : setInvalid(true))}
            className={cn(
              "inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95",
              checked ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "bg-primary/40 text-primary-foreground/80",
            )}
          >
            Перейти к оплате
            <ExternalLinkIcon className="size-3.5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A plain line under a one-click sign-in (Telegram): continuing means accepting. */
export function ConsentNote({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <p className={cn("text-center text-[11px] leading-relaxed text-muted-foreground", className)}>
      {children ?? "Входя через Telegram впервые, вы создаёте аккаунт и принимаете "}
      <LegalLink id="terms">Пользовательское соглашение</LegalLink>, <LegalLink id="privacy">Политику конфиденциальности</LegalLink> и даёте{" "}
      <LegalLink id="consent">согласие на обработку данных</LegalLink>.
    </p>
  );
}
