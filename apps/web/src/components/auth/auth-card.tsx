import type { ComponentProps, ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Centered single-column auth card on a faint "projection booth" wash.
 * Layout follows current login/signup UX guidance: one column, labels above
 * inputs, generous spacing between field groups, thumb-friendly 44px controls,
 * inline errors tied to their field.
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="relative flex min-h-[calc(100dvh-7rem)] items-center justify-center px-4 py-10 sm:py-16">
      {/* ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/3 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <span className="absolute right-6 top-6 select-none font-display text-[14rem] leading-none text-foreground/[0.03] sm:right-16">
          影
        </span>
      </div>

      <div className="w-full max-w-[400px]">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 font-display text-lg tracking-tight"
        >
          <span aria-hidden className="text-primary">
            影
          </span>
          AnimeShadow
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur sm:p-8">
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

export function FormErrorAlert({ message }: { message?: string }) {
  const t = useT();
  if (!message) return null;
  return (
    <Alert variant="destructive" className="mb-4">
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
        <p id={errorId} className="text-xs text-destructive">
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

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive";

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
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        tabIndex={-1}
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
    <Button type="submit" disabled={pending} className="h-11 w-full">
      {pending && <Spinner data-icon="inline-start" />}
      {children}
    </Button>
  );
}
