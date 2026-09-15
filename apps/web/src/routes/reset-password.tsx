import { resetPasswordInputSchema } from "@animeshadow/shared";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AuthCard,
  AuthField,
  FormErrorAlert,
  PasswordInput,
  SubmitButton,
  TextInput,
} from "@/components/auth/auth-card";
import { PasswordStrength } from "@/components/auth/password-strength";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useResetPassword } from "@/lib/query";

type Errors = Partial<Record<"email" | "code" | "password" | "form", string>>;

export function Component() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const resetPassword = useResetPassword();

  const [email, setEmail] = useState(params.get("email") ?? "");
  // Prefilled when arriving from the email's one-click link.
  const [code, setCode] = useState(
    () => params.get("code")?.replace(/\D/g, "").slice(0, 6) ?? "",
  );
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = resetPasswordInputSchema.safeParse({ email, code, password });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as keyof Errors] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    resetPassword.mutate(parsed.data, {
      onSuccess: () => setDone(true),
      onError: (err) => {
        if (err instanceof ApiRequestError && err.code === "INVALID_CODE") {
          setErrors({ code: t("auth.verifyEmail.invalidCode") });
        } else {
          setErrors({ form: t("auth.genericError") });
        }
      },
    });
  };

  if (done) {
    return (
      <AuthCard
        title={t("auth.resetPasswordPage.title")}
        subtitle={t("auth.resetPasswordPage.success")}
        footer={null}
      >
        <Button onClick={() => navigate("/login")} className="h-11 w-full">
          {t("auth.resetPasswordPage.goToLogin")}
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("auth.resetPasswordPage.title")}
      subtitle={t("auth.resetPasswordPage.subtitle")}
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
        <FormErrorAlert message={errors.form} />

        <AuthField label={t("auth.email")} error={errors.email}>
          {(p) => (
            <TextInput
              {...p}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </AuthField>

        <AuthField label={t("auth.resetPasswordPage.code")} error={errors.code}>
          {() => <CodeInput value={code} onChange={setCode} />}
        </AuthField>

        <AuthField
          label={t("auth.resetPasswordPage.newPassword")}
          error={errors.password}
          hint={errors.password ? undefined : t("auth.passwordHint")}
        >
          {(p) => (
            <PasswordInput
              {...p}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </AuthField>
        <div className="-mt-3">
          <PasswordStrength password={password} />
        </div>

        <SubmitButton pending={resetPassword.isPending}>
          {t("auth.resetPasswordPage.submit")}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
