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
    this.warnIfUndeliverable();
  }

  /**
   * Says at boot, once, when the configuration cannot actually deliver to a
   * real user — rather than letting every send fail one at a time into a
   * warning nobody reads.
   *
   * The second case is the one that bites in production: Resend's shared
   * `onboarding@resend.dev` sender is not merely "low deliverability", it is
   * restricted to the address that owns the Resend account. Mail to anyone
   * else is refused outright, so signup verification silently never arrives
   * for every real visitor while working perfectly for whoever set it up.
   */
  private warnIfUndeliverable(): void {
    if (!this.client) {
      this.logger.warn(
        {},
        "RESEND_API_KEY is not set — verification and reset codes will be printed to this log instead of emailed",
      );
      return;
    }
    if (/@resend\.dev>?\s*$/i.test(this.from)) {
      this.logger.warn(
        { from: this.from },
        "EMAIL_FROM uses Resend's shared onboarding sender, which can only deliver to the Resend account owner's own address — every other recipient will be refused. Verify a domain in Resend and set EMAIL_FROM to an address on it.",
      );
    }
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
        // Resend reports refusals in the body with a 200, so this is the only
        // place a bad sender/domain/quota ever surfaces. Logged with its own
        // name and message rather than as an opaque object, because this is
        // the line someone will be searching for when mail "just doesn't
        // arrive".
        this.logger.warn(
          {
            to: opts.to,
            from: this.from,
            resendError: result.error.name,
            reason: result.error.message,
          },
          `resend refused the message: ${result.error.message}`,
        );
      }
    } catch (error) {
      // Email delivery is never allowed to block or fail the calling flow
      // (registration, password reset) — the code is already saved server-side
      // and a "resend code" affordance covers a lost/delayed email.
      this.logger.warn({ error, to: opts.to }, "resend send threw");
    }
  }
}
