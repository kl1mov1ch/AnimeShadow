/**
 * Inline-styled HTML for transactional email — email clients strip <style>
 * tags and external fonts unpredictably, so every rule lives on the element
 * itself. Loosely matches the web app's dark "screening room" look (same
 * background/card/primary tokens as apps/web/src/index.css) without
 * depending on anything the app itself renders.
 */

const COLORS = {
  background: "#0a0b10",
  card: "#12141c",
  cardBorder: "#242733",
  primary: "#ff4d6d",
  primaryInk: "#1a0209",
  primarySoft: "#ff4d6d1a",
  text: "#e9eaf0",
  muted: "#9195a6",
};

interface CodeEmail {
  displayName: string;
  code: string;
  /** One-click link that opens the site with the code already filled in. */
  actionUrl: string;
}

function shell(opts: { preheader: string; title: string; body: string }): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>${opts.title}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Preheader: hidden preview text some clients show next to the subject -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <span style="font-size:22px;font-weight:800;letter-spacing:-0.02em;color:${COLORS.text};">
                  <span style="color:${COLORS.primary};">影</span> AnimeShadow
                </span>
              </td>
            </tr>
            <tr>
              <td style="background:${COLORS.card};border:1px solid ${COLORS.cardBorder};border-radius:16px;padding:32px 28px;">
                ${opts.body}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">
                  AnimeShadow — тёмный зал, где всё внимание аниме.<br />
                  Это письмо отправлено автоматически, отвечать на него не нужно.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function actionButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 4px;">
    <tr>
      <td align="center" style="border-radius:12px;background:${COLORS.primary};">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:${COLORS.primaryInk};text-decoration:none;border-radius:12px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function codeBlock(code: string): string {
  const digits = code.split("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px auto 20px;">
    <tr>
      ${digits
        .map(
          (d) => `<td style="width:40px;height:52px;text-align:center;vertical-align:middle;background:${COLORS.primarySoft};border:1px solid ${COLORS.primary}55;border-radius:10px;font-size:26px;font-weight:800;color:${COLORS.primary};font-family:'Consolas','SFMono-Regular',Menlo,monospace;">${d}</td><td style="width:8px;">&nbsp;</td>`,
        )
        .join("")}
    </tr>
  </table>`;
}

function divider(label: string): string {
  return `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:${COLORS.muted};text-align:center;">${label}</p>`;
}

export function verificationEmailHtml(opts: CodeEmail): string {
  const body = `
    <h1 style="margin:0 0 4px;font-size:18px;color:${COLORS.text};">Привет, ${escapeHtml(opts.displayName)}!</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.muted};">
      Остался один шаг — подтвердите почту, и аккаунт на AnimeShadow будет создан.
    </p>
    ${actionButton(opts.actionUrl, "Подтвердить почту")}
    ${divider("или введите код на сайте")}
    ${codeBlock(opts.code)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};text-align:center;">
      Код и кнопка действуют 15 минут. Если вы не регистрировались — просто проигнорируйте письмо.
    </p>`;
  return shell({
    preheader: `Ваш код подтверждения: ${opts.code}`,
    title: "Подтверждение почты — AnimeShadow",
    body,
  });
}

export function verificationEmailText(opts: CodeEmail): string {
  return [
    `Привет, ${opts.displayName}!`,
    "",
    "Подтвердите почту, чтобы завершить регистрацию на AnimeShadow.",
    `Код: ${opts.code}`,
    `Или откройте ссылку: ${opts.actionUrl}`,
    "",
    "Код действует 15 минут. Если вы не регистрировались — проигнорируйте письмо.",
  ].join("\n");
}

export function passwordResetEmailHtml(opts: CodeEmail): string {
  const body = `
    <h1 style="margin:0 0 4px;font-size:18px;color:${COLORS.text};">Сброс пароля</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.muted};">
      Привет, ${escapeHtml(opts.displayName)}. Кто-то (надеемся, вы) запросил сброс пароля для аккаунта AnimeShadow.
    </p>
    ${actionButton(opts.actionUrl, "Задать новый пароль")}
    ${divider("или введите код на сайте")}
    ${codeBlock(opts.code)}
    <p style="margin:0;font-size:13px;line-height:1.6;color:${COLORS.muted};text-align:center;">
      Код и кнопка действуют 15 минут. Если это были не вы — проигнорируйте письмо, пароль останется прежним.
    </p>`;
  return shell({
    preheader: `Код для сброса пароля: ${opts.code}`,
    title: "Сброс пароля — AnimeShadow",
    body,
  });
}

export function passwordResetEmailText(opts: CodeEmail): string {
  return [
    `Привет, ${opts.displayName}.`,
    "",
    "Для аккаунта AnimeShadow запрошен сброс пароля.",
    `Код: ${opts.code}`,
    `Или откройте ссылку: ${opts.actionUrl}`,
    "",
    "Код действует 15 минут. Если это были не вы — проигнорируйте письмо.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
