import type { ComponentProps, ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { ReactionGif } from "@/components/common/reaction-gif";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { PerksList } from "./guest-nudge";
import { PromoStrip } from "@/components/promo/promo-offer";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** Login and sign-up get a side with a face and what an account gives. */
  showcase?: "login" | "register";
}

const SHOWCASE = {
  login: {
    gif: "wave",
    title: "Мы скучали!",
    text: "Твой список, прогресс серий и подборки ждут — ровно там, где ты остановился.",
    badge: "Скучали 💜",
  },
  register: {
    gif: "happy",
    title: "Стань своим на AnimeShadow",
    text: "Бесплатно и за 20 секунд. Вот что появится сразу после регистрации:",
    badge: "Будем рады 🥺",
  },
} as const;

/** Two soft pools of the site colour behind everything — depth, not noise. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/4 top-1/4 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.13] blur-[120px]" />
      <div className="absolute bottom-0 right-[10%] size-[26rem] rounded-full bg-fuchsia-500/[0.07] blur-[110px]" />
    </div>
  );
}

/** The side of the card with a face: a gif, a line, and (on sign-up) the perks. */
function Showcase({ kind }: { kind: "login" | "register" }) {
  const c = SHOWCASE[kind];
  return (
    <div className="relative isolate flex flex-col overflow-hidden border-b border-border/50 bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_60%)] p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-9">
      <LogoWatermark className="-bottom-10 -right-10 size-72 text-primary/[0.07]" />
      {/* Phone: a short strip — face and a line, the form right under it. */}
      <div className="flex items-center gap-4 lg:hidden">
        <ReactionGif category={c.gif} className="size-16 shrink-0 shadow-lg sm:size-20" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-display text-lg leading-tight">{c.title}</p>
          <p className="text-xs leading-relaxed text-foreground/75">{c.text}</p>
        </div>
      </div>
      {kind === "register" && <PromoStrip className="mt-3 lg:hidden" />}
      {/* Computer: the full side. */}
      <div className="hidden h-full flex-col gap-6 lg:flex">
        <div className="relative w-44">
          <ReactionGif category={c.gif} className="aspect-square w-full shadow-xl shadow-black/30" />
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-semibold shadow-lg">
            {c.badge}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-display text-3xl leading-tight">{c.title}</p>
          <p className="text-sm leading-relaxed text-foreground/75">{c.text}</p>
        </div>
        {kind === "register" ? (
          <>
            <PerksList />
            <PromoStrip className="mt-auto" />
          </>
        ) : (
          <div className="mt-auto grid grid-cols-3 gap-2">
            {[
              ["Прогресс", "с той же минуты"],
              ["Мой список", "и оценки"],
              ["Профиль", "уровни и рамки"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
                <p className="text-sm font-semibold">{a}</p>
                <p className="text-[11px] text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The auth screen: one solid card a shade lighter than the page with the
 * site's coloured ring — the same family as the account menu and the
 * notifications. Login and sign-up split it in two on a computer (a face
 * and what an account gives on the left, the form on the right); on a phone
 * the face becomes a strip above the form. The other auth pages keep the
 * single column.
 */
export function AuthCard({ title, subtitle, children, footer, showcase }: AuthCardProps) {
  return (
    <div className="relative flex min-h-[calc(100dvh-7rem)] items-center justify-center overflow-hidden px-4 py-8 sm:py-14">
      <Backdrop />

      <div className={cn("w-full animate-in duration-500 fade-in slide-in-from-bottom-4", showcase ? "max-w-[920px]" : "max-w-[420px]")}>
        <div
          className={cn(
            "relative overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--card)_94%,white_6%)] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]",
            showcase && "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]",
          )}
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          {showcase && <Showcase kind={showcase} />}
          <div className="relative isolate overflow-hidden p-5 sm:p-8">
            {!showcase && <LogoWatermark className="-right-12 -top-12 size-48" />}
            <Link to="/" className="mb-5 flex items-center gap-2 font-display text-base tracking-tight text-foreground/90">
              <LogoGlyph className="size-5 text-primary" />
              AnimeShadow
            </Link>
            <div className="mb-6 flex flex-col gap-1.5">
              <h1 className="font-display text-2xl">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
            <p className="mt-6 border-t border-border/50 pt-5 text-center text-sm text-muted-foreground">{footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Separates the email/password form from an alternate sign-in method below it. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      {label}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  );
}

export function FormErrorAlert({ message }: { message?: string }) {
  const t = useT();
  if (!message) return null;
  return (
    <Alert
      variant="destructive"
      className="animate-in fade-in slide-in-from-top-1 mb-4 rounded-2xl duration-300"
    >
      <AlertTitle>{t("auth.couldntContinue")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** One labelled input + inline error, spaced consistently. */
export function AuthField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error ? (
        <p
          id={errorId}
          className="animate-in fade-in slide-in-from-top-1 text-xs text-destructive duration-200"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// Matches the shared Input primitive: the site's radius and a focus that
// blooms in the primary colour rather than a grey ring.
const inputClass =
  "h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/15 aria-[invalid=true]:border-destructive";

export function TextInput(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

/** Password input with a show/hide toggle — a modern-form standard. */
export function PasswordInput(props: ComponentProps<"input">) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        className={cn(inputClass, "pr-11", props.className)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="group relative h-11 w-full overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:hover:translate-y-0"
    >
      {pending && <Spinner data-icon="inline-start" />}
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
      />
    </Button>
  );
}
