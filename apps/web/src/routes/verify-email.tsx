import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthCard } from "@/components/auth/auth-card";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { clearLinkParams, linkParam } from "@/lib/link-params";
import { useResendRegistration } from "@/lib/query";
import { forgetReferral } from "@/lib/referral";

const RESEND_COOLDOWN_SECONDS = 45;
const PENDING_EMAIL_KEY = "animeshadow.pendingSignupEmail";

function readPendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

function writePendingEmail(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(PENDING_EMAIL_KEY, email);
    else sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    /* storage blocked — the router state / link still carries it */
  }
}

/**
 * Step 2 of signup (see routes/register.tsx) — no account exists yet; the
 * code confirmed here is what creates it (AuthService.confirmRegistration).
 * The email arrives three ways: the one-click link in the email itself
 * (`?email=&code=`, auto-submitted), router state from the signup form, or
 * sessionStorage after a refresh. With none of those there's nothing to
 * confirm, so it bounces back to the form.
 */
export function Component() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const stateEmail = (location.state as { email?: string } | null)?.email;
  const [email] = useState<string | undefined>(
    () => linkParam("email") ?? stateEmail ?? readPendingEmail() ?? undefined,
  );
  const [linkCode] = useState(() => linkParam("code"));
  useEffect(() => clearLinkParams(), []);
  // Asked for when the code is confirmed in a browser that didn't send the
  // signup form (the mail opened on another device) — see confirmRegistration.
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const { confirmRegistration } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [resentNotice, setResentNotice] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const autoSubmitted = useRef(false);

  const resend = useResendRegistration();

  useEffect(() => {
    if (!email) navigate("/register", { replace: true });
    else writePendingEmail(email);
  }, [email, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      if (!email) return;
      setError(undefined);
      setPending(true);
      try {
        await confirmRegistration(email, value, needPassword ? password : undefined);
        writePendingEmail(null);
        forgetReferral();
        toast.success("Аккаунт создан!", { description: "И месяц PRO в подарок — он уже включён" });
        navigate("/library", { replace: true });
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === "PASSWORD_REQUIRED") {
          // Keep the code; only the password is missing (or wrong).
          if (needPassword) setError(t("auth.verifyEmail.passwordWrong"));
          setNeedPassword(true);
          return;
        }
        const message =
          err instanceof ApiRequestError && err.code === "INVALID_CODE"
            ? t("auth.verifyEmail.invalidCode")
            : t("auth.genericError");
        setError(message);
        toast.error("Код не подошёл", { description: message });
        setCode("");
      } finally {
        setPending(false);
      }
    },
    [email, confirmRegistration, navigate, t, needPassword, password],
  );

  useEffect(() => {
    if (autoSubmitted.current || !email || !linkCode || !/^\d{6}$/.test(linkCode)) return;
    autoSubmitted.current = true;
    setCode(linkCode);
    void submit(linkCode);
  }, [email, linkCode, submit]);

  const onResend = () => {
    if (!email) return;
    setResentNotice(false);
    resend.mutate(email, {
      onSuccess: () => {
        setResentNotice(true);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      },
    });
  };

  if (!email) return null;

  return (
    <AuthCard
      title={t("auth.verifyEmail.title")}
      subtitle={t("auth.verifyEmail.subtitle", { email })}
      footer={
        <button
          type="button"
          onClick={() => {
            writePendingEmail(null);
            navigate("/register", { replace: true });
          }}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          {t("auth.verifyEmail.wrongEmail")}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={submit}
          disabled={pending}
          {...(error ? { error } : {})}
        />

        {needPassword && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("auth.verifyEmail.passwordPrompt")}</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && password) void submit(code);
              }}
              className="h-11 rounded-lg border border-border/70 bg-card/60 px-3 outline-none focus:border-foreground/30"
            />
          </label>
        )}

        <Button
          type="button"
          disabled={code.length !== 6 || pending || (needPassword && !password)}
          onClick={() => submit(code)}
          className="h-11 w-full"
        >
          {pending && <Spinner data-icon="inline-start" />}
          {t("auth.verifyEmail.submit")}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          {resentNotice && (
            <p role="status" className="mb-1.5 text-emerald-600 dark:text-emerald-400">
              {t("auth.verifyEmail.resent")}
            </p>
          )}
          <button
            type="button"
            onClick={onResend}
            disabled={cooldown > 0 || resend.isPending}
            className="font-medium underline underline-offset-4 hover:text-primary disabled:pointer-events-none disabled:opacity-60"
          >
            {cooldown > 0
              ? t("auth.verifyEmail.resendCooldown", { seconds: cooldown })
              : t("auth.verifyEmail.resend")}
          </button>
        </div>
      </div>
    </AuthCard>
  );
}
