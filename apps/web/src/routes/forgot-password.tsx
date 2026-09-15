import { forgotPasswordInputSchema } from "@animeshadow/shared";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AuthCard,
  AuthField,
  FormErrorAlert,
  SubmitButton,
  TextInput,
} from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { useForgotPassword } from "@/lib/query";

/**
 * Always ends in the same "check your email" state whether or not the
 * address is actually registered — the API itself is enumeration-safe
 * (POST /auth/forgot-password always returns 204), and the UI mirrors that
 * rather than second-guessing it client-side.
 */
export function Component() {
  const t = useT();
  const navigate = useNavigate();
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = forgotPasswordInputSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("auth.genericError"));
      return;
    }
    setError(undefined);
    forgotPassword.mutate(parsed.data, {
      onSuccess: () => setSent(true),
      onError: () => setError(t("auth.genericError")),
    });
  };

  if (sent) {
    return (
      <AuthCard
        title={t("auth.forgotPasswordPage.sentTitle")}
        subtitle={t("auth.forgotPasswordPage.sentBody", { email })}
        footer={
          <Link
            to="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t("auth.forgotPasswordPage.backToLogin")}
          </Link>
        }
      >
        <Button
          onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
          className="h-11 w-full"
        >
          {t("auth.forgotPasswordPage.continueCta")}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.forgotPasswordPage.title")}
      subtitle={t("auth.forgotPasswordPage.subtitle")}
      footer={
        <Link
          to="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          {t("auth.forgotPasswordPage.backToLogin")}
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormErrorAlert message={error} />
        <AuthField label={t("auth.email")}>
          {(p) => (
            <TextInput
              {...p}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          )}
        </AuthField>
        <SubmitButton pending={forgotPassword.isPending}>
          {t("auth.forgotPasswordPage.submit")}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
