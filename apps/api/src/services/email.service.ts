import { Resend } from "resend";
import {
  passwordResetEmailHtml,
  passwordResetEmailText,
  verificationEmailHtml,
  verificationEmailText,
} from "../lib/email-templates.js";
import { emailsSentTotal } from "../lib/metrics.js";

interface EmailLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface EmailServiceDeps {
  apiKey?: string | undefined;
  from: string;
  /** Public web origin (no trailing slash) for the one-click links. */
  appUrl: string;
  logger: EmailLogger;
}

/**
 * Thin wrapper over Resend. With no API key configured (the common case for
 * a fresh local checkout — see .env.example), every "send" instead logs the
 * code and link straight to the console: signup and password reset keep
 * working end-to-end with zero setup.
 */
export class EmailService {
  private readonly client: Resend | null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly logger: EmailLogger;

  constructor(deps: EmailServiceDeps) {
    this.client = deps.apiKey ? new Resend(deps.apiKey) : null;
    this.from = deps.from;
    this.appUrl = deps.appUrl;
    this.logger = deps.logger;
  }

  async sendVerificationCode(to: string, displayName: string, code: string): Promise<void> {
    emailsSentTotal.inc({ kind: "verification" });
    const content = { displayName, code, actionUrl: this.link("/verify-email", to, code) };
    await this.send({
      to,
      subject: `${code} — код подтверждения AnimeShadow`,
      html: verificationEmailHtml(content),
      text: verificationEmailText(content),
      devLabel: "email verification code",
      code,
      actionUrl: content.actionUrl,
    });
  }

  async sendPasswordResetCode(to: string, displayName: string, code: string): Promise<void> {
    emailsSentTotal.inc({ kind: "password_reset" });
    const content = { displayName, code, actionUrl: this.link("/reset-password", to, code) };
    await this.send({
      to,
      subject: `${code} — сброс пароля AnimeShadow`,
      html: passwordResetEmailHtml(content),
      text: passwordResetEmailText(content),
      devLabel: "password reset code",
      code,
      actionUrl: content.actionUrl,
    });
  }

  private link(path: string, email: string, code: string): string {
    return `${this.appUrl}${path}?${new URLSearchParams({ email, code }).toString()}`;
  }

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    text: string;
    devLabel: string;
    code: string;
    actionUrl: string;
  }): Promise<void> {
    if (!this.client) {
      // Dev fallback — no RESEND_API_KEY set. Loud and obvious in the logs
      // rather than silently doing nothing.
      this.logger.info(
        { to: opts.to, code: opts.code, link: opts.actionUrl },
        `[dev email] ${opts.devLabel} (RESEND_API_KEY not set — printing instead of sending)`,
      );
      return;
    }

    try {
      const result = await this.client.emails.send({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      if (result.error) {
        this.logger.warn({ error: result.error, to: opts.to }, "resend send failed");
      }
    } catch (error) {
      // Email delivery is never allowed to block or fail the calling flow
      // (registration, password reset) — the code is already saved server-side
      // and a "resend code" affordance covers a lost/delayed email.
      this.logger.warn({ error, to: opts.to }, "resend send threw");
    }
  }
}
