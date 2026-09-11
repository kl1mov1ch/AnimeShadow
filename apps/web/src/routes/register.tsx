import { registerInputSchema } from "@animeshadow/shared";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AuthCard,
  AuthField,
  FormErrorAlert,
  PasswordInput,
  SubmitButton,
  TextInput,
} from "@/components/auth/auth-card";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";

type FieldName = "displayName" | "email" | "password";
type Errors = Partial<Record<FieldName | "form", string>>;

export function Component() {
  const t = useT();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      displayName: String(form.get("displayName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const parsed = registerInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as FieldName] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setPending(true);
    try {
      await register(parsed.data);
      navigate("/library", { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors({
          displayName: error.fieldError("displayName"),
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
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSub")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            {t("auth.signInCta")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <FormErrorAlert message={errors.form} />

        <AuthField label={t("auth.displayName")} error={errors.displayName}>
          {(p) => (
            <TextInput
              {...p}
              name="displayName"
              autoComplete="nickname"
              placeholder={t("auth.displayNamePlaceholder")}
              autoFocus
              required
            />
          )}
        </AuthField>

        <AuthField label={t("auth.email")} error={errors.email}>
          {(p) => (
            <TextInput
              {...p}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t("auth.emailPlaceholder")}
              required
            />
          )}
        </AuthField>

        <AuthField
          label={t("auth.password")}
          error={errors.password}
          hint={errors.password ? undefined : t("auth.passwordHint")}
        >
          {(p) => (
            <PasswordInput
              {...p}
              name="password"
              autoComplete="new-password"
              required
            />
          )}
        </AuthField>

        <SubmitButton pending={pending}>{t("auth.registerCta")}</SubmitButton>
      </form>
    </AuthCard>
  );
}
