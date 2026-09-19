import type { ComponentProps, ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { PulseRings } from "@/components/common/pulse-rings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * The backdrop: the site's own mark, at several sizes, plus one slow
 * monochrome Lottie loop.
 *
 * It used to be a scatter of reaction gifs. They were loud, they were
 * somebody else's artwork, and every one of them fought the form for
 * attention. The wordmark is ours, it costs one glyph, and because the
 * Lottie beside it carries no colour of its own both adapt to the theme
 * without a second asset.
 */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Two slow pools of colour instead of one flat blur, so the
          backdrop has some depth to it. */}
      <div className="absolute left-1/2 top-1/3 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute right-[12%] top-[62%] size-[28rem] rounded-full bg-primary/[0.07] blur-[110px]" />

      {/* The mark, three times over at three weights — a composition rather
          than a single stamp in the corner. */}
      <span className="absolute -left-10 top-[8%] select-none font-display text-[18rem] leading-none text-foreground/[0.035]">
        <SlicedGlyph />
      </span>
      <span className="absolute -right-6 bottom-[6%] select-none font-display text-[13rem] leading-none text-foreground/[0.03]">
        <SlicedGlyph />
      </span>
      <span className="absolute right-[18%] top-[14%] hidden select-none font-display text-[7rem] leading-none text-primary/[0.06] lg:block">
        <SlicedGlyph />
      </span>

      {/* Monochrome by rule, so it reads in both themes off one file. */}
      <PulseRings className="absolute left-1/2 top-1/2 size-[40rem] -translate-x-1/2 -translate-y-1/2 text-primary/25" />

      {/* Keeps the card legible over whatever lands behind it. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
    </div>
  );
}

/**
 * The auth screen, rebuilt as a room rather than a form on a page: a wash of
 * the site colour, the 影 mark drifting behind everything, and a scatter of
 * looping art that only appears from the large breakpoint up, where there is
 * genuinely space beside the card for it.
 *
 * The card itself stays a single column with labels above inputs and errors
 * tied to their field — that part was already right, and widening or
 * splitting it would cost more than the decoration is worth.
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div data-glyph-host className="relative flex min-h-[calc(100dvh-7rem)] items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <Backdrop />

      <div className="animate-in fade-in slide-in-from-bottom-4 w-full max-w-[400px] duration-500">
        <Link
          to="/"
          className="group mb-6 flex items-center justify-center gap-2 font-display text-lg tracking-tight"
        >
          <span
            aria-hidden
            className="text-primary transition-transform duration-300 group-hover:scale-110"
          >
            <SlicedGlyph />
          </span>
          AnimeShadow
        </Link>

        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
          {/* The site hairline, same as the header and every dialog. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          />
          <div className="mb-6 flex flex-col gap-1.5 text-center">
            <h1 className="font-display text-2xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
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
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
      className="group relative h-11 w-full overflow-hidden bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-lg shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 disabled:hover:translate-y-0"
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
