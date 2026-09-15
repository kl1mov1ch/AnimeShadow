import { loginInputSchema } from "@animeshadow/shared";
import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AuthCard,
  AuthDivider,
  AuthField,
  FormErrorAlert,
  PasswordInput,
  SubmitButton,
  TextInput,
} from "@/components/auth/auth-card";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { isTelegramLoginSupported, type TelegramAuthData } from "@/lib/telegram-auth";

type Errors = Partial<Record<"email" | "password" | "form", string>>;

export function Component() {
  const t = useT();
  const { login, loginWithTelegram } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const onTelegramAuth = async (data: TelegramAuthData) => {
    setErrors({});
    try {
      await loginWithTelegram(data);
      navigate(from, { replace: true });
    } catch (error) {
      setErrors({
        form: error instanceof ApiRequestError ? error.message : t("auth.genericError"),
      });
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const parsed = loginInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof Errors] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      await login(parsed.data);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors({
          email: error.fieldError("email"),
          password: error.fieldError("password"),
          form: error.fields ? undefined : error.message,
        });
      } else {
        setErrors({ form: t("auth.genericError") });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      title={t("auth.welcomeBack")}
      subtitle={t("auth.welcomeBackSub")}
      footer={
        <>
          {t("auth.newHere")}{" "}
          <Link
            to="/register"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t("auth.createOne")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormErrorAlert message={errors.form} />

        <AuthField label={t("auth.email")} error={errors.email}>
          {(p) => (
            <TextInput
              {...p}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t("auth.emailPlaceholder")}
              autoFocus
              required
            />
          )}
        </AuthField>

        <AuthField label={t("auth.password")} error={errors.password}>
          {(p) => (
            <PasswordInput
              {...p}
              name="password"
              autoComplete="current-password"
              required
            />
          )}
        </AuthField>

        <Link
          to="/forgot-password"
          className="-mt-3 self-end text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          {t("auth.forgotPassword")}
        </Link>

        <SubmitButton pending={pending}>{t("auth.signInCta")}</SubmitButton>
      </form>

      {isTelegramLoginSupported() && (
        <>
          <AuthDivider label={t("auth.orDivider")} />
          <TelegramLoginButton onAuth={onTelegramAuth} />
        </>
      )}
    </AuthCard>
  );
}
