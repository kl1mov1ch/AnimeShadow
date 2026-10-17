import { registerInputSchema } from "@animeshadow/shared";
import { GiftIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
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
import { PasswordStrength } from "@/components/auth/password-strength";
import { CodeInput } from "@/components/auth/code-input";
import { ConsentCheck } from "@/components/legal/consent";
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { isTelegramLoginSupported, type TelegramAuthData } from "@/lib/telegram-auth";
import { readReferral, useReferralCheck } from "@/lib/referral";
import { getFirstTouchReferrer } from "@/lib/visitor";
import { forgetReferral } from "@/lib/referral";

type FieldName = "displayName" | "email" | "password";
type Errors = Partial<Record<FieldName | "form", string>>;

export function Component() {
  const t = useT();
  const { requestRegistration, confirmRegistration, loginWithTelegram } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const returnTo = from?.startsWith("/") && !from.startsWith("//") ? from : "/library";
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const confirm = async (value: string) => {
    if (!pendingEmail || confirming) return;
    setConfirming(true);
    setCodeError(undefined);
    try {
      await confirmRegistration(pendingEmail, value, password || undefined);
      forgetReferral();
      toast.success("Аккаунт создан!");
      navigate(returnTo, { replace: true });
    } catch (error) {
      setCodeError(error instanceof ApiRequestError ? error.message : t("auth.genericError"));
      setCode("");
    } finally { setConfirming(false); }
  };
  // The consent box — required for both ways in (form and Telegram).
  const [accepted, setAccepted] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const needConsent = () => {
    setConsentMissing(true);
    toast.error("Отметьте согласие", { description: "Без него аккаунт не создать — документы открываются по ссылкам." });
  };
  // A friend's code: from the invite link (kept since it was opened), or typed.
  const [friendCode, setFriendCode] = useState(() => readReferral());
  const friend = useReferralCheck(friendCode);

  const onTelegramAuth = async (data: TelegramAuthData) => {
    setErrors({});
    try {
      await loginWithTelegram(data);
      toast.success("Добро пожаловать!", { description: "Аккаунт готов — начинай собирать свой список" });
      navigate(returnTo, { replace: true });
    } catch (error) {
      const message = error instanceof ApiRequestError ? error.message : t("auth.genericError");
      setErrors({ form: message });
      toast.error("Не получилось зарегистрироваться", { description: message });
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      displayName: String(form.get("displayName") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      referrer: getFirstTouchReferrer() || undefined,
      referralCode: friendCode.trim() || undefined,
      acceptTerms: accepted,
    };
    if (!accepted) {
      needConsent();
      return;
    }

    const parsed = registerInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        next[issue.path[0] as FieldName] = issue.message;
      }
      setErrors(next);
      toast.error("Проверьте поля", { description: Object.values(next)[0] });
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const signedIn = await requestRegistration(parsed.data);
      if (signedIn) {
        setPendingEmail(null);
        setNeedsEmailCode(false);
        forgetReferral();
        toast.success("Аккаунт создан!");
        navigate(returnTo, { replace: true });
        return;
      }
      setPendingEmail(parsed.data.email);
      setNeedsEmailCode(true);
      setCode("");
      setCodeError(undefined);
      toast.success("Письмо отправлено", { description: "Подтверждение доступно здесь, на странице регистрации." });
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors({
          displayName: error.fieldError("displayName"),
          email: error.fieldError("email"),
          password: error.fieldError("password"),
          form: error.fields ? undefined : error.message,
        });
        toast.error("Не получилось зарегистрироваться", {
          description:
            error.fieldError("email") ?? error.fieldError("displayName") ?? error.fieldError("password") ?? error.message,
        });
      } else {
        setErrors({ form: t("auth.genericError") });
        toast.error("Не получилось зарегистрироваться", { description: t("auth.genericError") });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthCard
      showcase="register"
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
      <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col gap-3.5 sm:gap-5">
        <FormErrorAlert message={errors.form} />

        <AuthField label={t("auth.displayName")} error={errors.displayName}>
          {(p) => (
            <TextInput
              {...p}
              name="displayName"
              autoComplete="nickname"
              placeholder={t("auth.displayNamePlaceholder")}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </AuthField>
        <div className="-mt-3">
          <PasswordStrength password={password} />
        </div>

        <details className="rounded-xl border border-border/60 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Есть код друга?</summary><div className="pt-3"><AuthField
          label="Код друга"
          hint={
            friend.data?.valid
              ? undefined
              : friendCode && friend.data && !friend.data.valid
                ? undefined
                : "Необязательно. Другу за тебя — награды, тебе — 15 дней PRO в любом случае."
          }
        >
          {(p) => (
            <div className="flex flex-col gap-1.5">
              <TextInput
                {...p}
                name="referralCode"
                value={friendCode}
                onChange={(event) => setFriendCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                placeholder="Например, HCXT5NW4"
                autoComplete="off"
                className="font-mono tracking-[0.15em]"
              />
              {friend.data?.valid && (
                <p className="flex animate-in items-center gap-1.5 text-xs font-medium text-emerald-400 duration-200 fade-in-0">
                  <GiftIcon className="size-3.5 shrink-0" />
                  Тебя пригласил(а) {friend.data.name} — вы оба получите бонусы
                </p>
              )}
              {friendCode.length >= 4 && friend.data && !friend.data.valid && (
                <p className="text-xs text-amber-400">Такого кода нет — проверь буквы или оставь поле пустым</p>
              )}
            </div>
          )}
        </AuthField></div></details>

        <ConsentCheck
          kind="register"
          checked={accepted}
          invalid={consentMissing && !accepted}
          onChange={(v) => {
            setAccepted(v);
            setConsentMissing(false);
          }}
        />

        <SubmitButton pending={pending}>{t("auth.registerCta")}</SubmitButton>
      </form>

      {needsEmailCode && pendingEmail && (
        <section aria-label="Подтверждение почты" className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-secondary/30 p-4">
          <p role="status" className="text-sm text-muted-foreground">Письмо с кодом отправлено на <span className="font-medium text-foreground">{pendingEmail}</span>. Страница регистрации остаётся открытой.</p>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-primary">Ввести код подтверждения</summary>
            <div className="mt-4 flex flex-col gap-3">
              <CodeInput value={code} onChange={setCode} onComplete={confirm} disabled={confirming} {...(codeError ? { error: codeError } : {})} />
              <Link to="/verify-email" state={{ email: pendingEmail }} className="text-center text-xs text-muted-foreground underline underline-offset-4">Отправить код повторно или открыть подтверждение отдельно</Link>
            </div>
          </details>
        </section>
      )}

      {isTelegramLoginSupported() && (
        <>
          <AuthDivider label={t("auth.orDivider")} />
          {/* The widget is Telegram's own frame: until the box is ticked, a
              cover over it asks for the consent first. */}
          <div className="relative">
            <TelegramLoginButton onAuth={onTelegramAuth} />
            {!accepted && (
              <button
                type="button"
                aria-label="Сначала отметьте согласие"
                onClick={needConsent}
                className="absolute inset-0 z-10 cursor-pointer rounded-xl"
              />
            )}
          </div>
        </>
      )}
    </AuthCard>
  );
}
