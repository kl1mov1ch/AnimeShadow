import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PrismaClient } from "@animeshadow/db";
import type { NotifySettings } from "@animeshadow/shared";
import type { FastifyBaseLogger } from "fastify";
import webpush from "web-push";

/** A new-episode line just written for someone (see NotificationService.observe). */
export interface EpisodeNews {
  userId: string;
  animeId: number;
  episode: number;
  fromEpisode: number | null;
}

/** A title whose newest episode just grew (see NotificationService.observe). */
export interface EpisodeGrowth {
  animeId: number;
  from: number;
  to: number;
}

/**
 * The VAPID pair push needs: from the environment if set, otherwise made
 * once and kept in a file next to the API (data/vapid.json) — push works
 * with nothing to configure, and the same keys survive restarts and
 * deploys (new keys would orphan every browser already subscribed).
 */
function vapidKeys(config: DeliveryConfig, log: FastifyBaseLogger): { publicKey: string; privateKey: string } | null {
  if (config.vapidPublicKey && config.vapidPrivateKey) return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey };
  const file = resolve(config.dataDir ?? resolve(process.cwd(), "data"), "vapid.json");
  try {
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8")) as { publicKey?: string; privateKey?: string };
      if (saved.publicKey && saved.privateKey) return { publicKey: saved.publicKey, privateKey: saved.privateKey };
    }
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(keys, null, 2));
    try {
      chmodSync(file, 0o600);
    } catch {
      // Windows: no modes — fine.
    }
    log.info({ file }, "push: VAPID keys created");
    return keys;
  } catch (error) {
    log.warn({ err: (error as Error).message }, "push: no VAPID keys, push is off");
    return null;
  }
}

export interface DeliveryConfig {
  telegramToken?: string | undefined;
  telegramPolling: boolean;
  vapidPublicKey?: string | undefined;
  vapidPrivateKey?: string | undefined;
  vapidSubject: string;
  /** Where generated VAPID keys are kept (default: <cwd>/data). */
  dataDir?: string;
  /** The site's address, for links in messages. */
  appUrl: string;
}

const LINK_TTL_MS = 15 * 60_000;
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function episodeLine(n: { episode: number; fromEpisode: number | null }): string {
  return n.fromEpisode != null ? `вышли серии ${n.fromEpisode}–${n.episode}` : `вышла ${n.episode} серия`;
}

/**
 * New episodes, beyond the bell on the site: a message from the site's
 * Telegram bot (the same one used to sign in) and a browser push
 * notification. Each person chooses on the account page; the bot also
 * answers /stop and /start.
 *
 * Telegram: a Telegram sign-in already lets the bot write to that person
 * (the login asks for it), anyone else ties a chat with a one-time
 * t.me/<bot>?start=<code> link from the account page. The bot reads its
 * chats by long polling — nothing to configure, no webhook.
 */
export class DeliveryService {
  private botName: string | null = null;
  private polling = false;
  private stopPolling: AbortController | null = null;
  private readonly vapid: { publicKey: string; privateKey: string } | null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly log: FastifyBaseLogger,
    private readonly config: DeliveryConfig,
  ) {
    this.vapid = vapidKeys(config, log);
    if (this.vapid) webpush.setVapidDetails(config.vapidSubject, this.vapid.publicKey, this.vapid.privateKey);
  }

  /** For a guest's browser: the key to subscribe with. */
  get publicKey(): string | null {
    return this.vapid?.publicKey ?? null;
  }

  get telegramReady(): boolean {
    return Boolean(this.config.telegramToken);
  }

  get pushReady(): boolean {
    return this.vapid != null;
  }

  // ---- settings ------------------------------------------------------------

  async settings(userId: string): Promise<NotifySettings> {
    const [user, devices] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true, telegramChatId: true, telegramBlockedAt: true, notifyTelegram: true, notifyPush: true },
      }),
      this.prisma.pushSubscription.count({ where: { userId } }),
    ]);
    return {
      telegram: {
        available: this.telegramReady,
        bot: this.telegramReady ? await this.botUsername() : null,
        connected: Boolean(user?.telegramChatId ?? user?.telegramId),
        blocked: user?.telegramBlockedAt != null,
        enabled: user?.notifyTelegram ?? true,
      },
      push: {
        available: this.pushReady,
        publicKey: this.vapid?.publicKey ?? null,
        enabled: user?.notifyPush ?? true,
        devices,
      },
    };
  }

  async update(userId: string, input: { telegram?: boolean; push?: boolean }): Promise<NotifySettings> {
    // Push off means gone: the browsers are forgotten (offered again later on the site).
    if (input.push === false) await this.prisma.pushSubscription.deleteMany({ where: { userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.telegram != null ? { notifyTelegram: input.telegram } : {}),
        ...(input.push != null ? { notifyPush: input.push } : {}),
      },
    });
    return this.settings(userId);
  }

  /** "Подключить Telegram": a link that opens the bot with a one-time code. */
  async telegramLink(userId: string): Promise<{ url: string }> {
    const bot = await this.botUsername();
    if (!bot) throw new Error("Telegram bot is not configured");
    const code = randomBytes(9).toString("base64url");
    await this.prisma.$transaction([
      this.prisma.telegramLinkCode.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } }),
      this.prisma.telegramLinkCode.create({ data: { code, userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) } }),
    ]);
    return { url: `https://t.me/${bot}?start=${code}` };
  }

  /** Stops the bot writing to this account (sign-in by Telegram stays). */
  async telegramUnlink(userId: string): Promise<NotifySettings> {
    await this.prisma.user.update({ where: { id: userId }, data: { telegramChatId: null, notifyTelegram: false } });
    return this.settings(userId);
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string }; visitorId?: string | undefined },
    userAgent?: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        visitorId: sub.visitorId ?? null,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...(sub.visitorId ? { visitorId: sub.visitorId } : {}) },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { notifyPush: true } });
    return this.settings(userId);
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return this.settings(userId);
  }

  /** A guest agreed: this browser hears about new episodes of what it watched. */
  async subscribeGuest(visitorId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
    const existing = await this.prisma.pushSubscription.findUnique({ where: { endpoint: sub.endpoint }, select: { userId: true } });
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { visitorId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
      // Already an account's: stays the account's.
      update: { visitorId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...(existing?.userId ? {} : { userId: null }) },
    });
    return { ok: true };
  }

  /** Off in this browser: the row goes (whoever's it was — the endpoint itself is the proof). */
  async forgetEndpoint(endpoint: string): Promise<{ ok: true }> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  /**
   * Guests subscribed in a browser that watched these titles in the last two
   * months: a push per title, told the episode that came out.
   */
  async deliverGuests(grown: EpisodeGrowth[]): Promise<void> {
    if (!this.pushReady || grown.length === 0) return;
    const since = new Date(Date.now() - 60 * 86_400_000);
    const watched = await this.prisma.guestWatchSession.findMany({
      where: { animeId: { in: grown.map((g) => g.animeId) }, startedAt: { gte: since } },
      select: { visitorId: true, animeId: true },
      distinct: ["visitorId", "animeId"],
    });
    if (watched.length === 0) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: null, visitorId: { in: [...new Set(watched.map((w) => w.visitorId))] } },
    });
    if (subs.length === 0) return;
    const anime = await this.prisma.anime.findMany({
      where: { id: { in: grown.map((g) => g.animeId) } },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true },
    });
    const titles = new Map(anime.map((a) => [a.id, a]));
    const growth = new Map(grown.map((g) => [g.animeId, g]));
    let sent = 0;
    for (const sub of subs) {
      const mine = watched.filter((w) => w.visitorId === sub.visitorId).map((w) => w.animeId);
      for (const animeId of mine.slice(0, 3)) {
        const a = titles.get(animeId);
        const g = growth.get(animeId);
        if (!a || !g) continue;
        const line = g.from < g.to ? `Вышли серии ${g.from}–${g.to}` : `Вышла ${g.to} серия`;
        if (await this.sendPush(sub, {
          title: a.titleLocalized || a.title,
          body: `${line} — смотреть на AnimeShadow`,
          url: `${this.config.appUrl}/anime/${a.slug || a.id}?ep=${g.from}#watch`,
          icon: a.imageUrl ?? undefined,
          tag: `anime-${a.id}`,
        })) sent += 1;
      }
    }
    this.log.info({ subscriptions: subs.length, sent }, "new episodes pushed to guests");
  }

  /** "Проверить": one message by every channel that is on. */
  async test(userId: string): Promise<{ telegram: boolean; push: number }> {
    const url = `${this.config.appUrl}/library#new-episodes`;
    const telegram = await this.sendTelegramTo(
      userId,
      "🔔 <b>Проверка уведомлений AnimeShadow</b>\n\nВсё работает: сюда придут новые серии из «Смотрю», «В планах» и «Отложено».",
      [{ text: "Мой список", url }],
    );
    const push = await this.pushTo(userId, { title: "AnimeShadow", body: "Уведомления работают — новые серии придут сюда.", url, tag: "test" });
    return { telegram, push };
  }

  /** One message to one person, by every channel they have on (a watch-together invite). */
  async direct(userId: string, msg: { title: string; body: string; url: string; button: string }): Promise<boolean> {
    const tg = await this.sendTelegramTo(userId, `🎬 <b>${escapeHtml(msg.title)}</b>
${escapeHtml(msg.body)}`, [{ text: msg.button, url: msg.url }]);
    const push = await this.pushTo(userId, { title: msg.title, body: msg.body, url: msg.url, tag: "party" });
    return tg || push > 0;
  }

  // ---- delivery ------------------------------------------------------------

  /** New-episode lines just written: told by Telegram and push, one message per person. */
  async deliver(items: EpisodeNews[]): Promise<void> {
    if (items.length === 0 || (!this.telegramReady && !this.pushReady)) return;
    const byUser = new Map<string, EpisodeNews[]>();
    for (const item of items) byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);
    const anime = await this.prisma.anime.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.animeId))] } },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true },
    });
    const titles = new Map(anime.map((a) => [a.id, a]));
    let sentTg = 0;
    let sentPush = 0;

    for (const [userId, news] of byUser) {
      const lines = news
        .map((n) => ({ n, a: titles.get(n.animeId) }))
        .filter((x): x is { n: EpisodeNews; a: (typeof anime)[number] } => x.a != null);
      if (lines.length === 0) continue;
      const href = (x: (typeof lines)[number]) =>
        `${this.config.appUrl}/anime/${x.a.slug || x.a.id}?ep=${x.n.fromEpisode ?? x.n.episode}#watch`;
      const name = (x: (typeof lines)[number]) => x.a.titleLocalized || x.a.title;

      const text =
        lines.length === 1
          ? `🔔 <b>${escapeHtml(name(lines[0]!))}</b>\n${capital(episodeLine(lines[0]!.n))}!`
          : `🔔 <b>Новые серии</b>\n\n${lines
              .slice(0, 12)
              .map((x) => `• <b>${escapeHtml(name(x))}</b> — ${episodeLine(x.n)}`)
              .join("\n")}${lines.length > 12 ? `\n…и ещё ${lines.length - 12}` : ""}`;
      const buttons = lines.slice(0, 3).map((x) => ({ text: lines.length === 1 ? "▶ Смотреть" : `▶ ${name(x).slice(0, 28)}`, url: href(x) }));
      if (await this.sendTelegramTo(userId, text, buttons)) sentTg += 1;

      if (lines.length <= 3) {
        for (const x of lines) {
          sentPush += await this.pushTo(userId, {
            title: name(x),
            body: `${capital(episodeLine(x.n))} — смотреть на AnimeShadow`,
            url: href(x),
            icon: x.a.imageUrl ?? undefined,
            tag: `anime-${x.a.id}`,
          });
        }
      } else {
        sentPush += await this.pushTo(userId, {
          title: `Новые серии: ${lines.length}`,
          body: lines.slice(0, 4).map(name).join(", ") + (lines.length > 4 ? "…" : ""),
          url: `${this.config.appUrl}/library#new-episodes`,
          tag: "episodes",
        });
      }
    }
    this.log.info({ users: byUser.size, telegram: sentTg, push: sentPush }, "new episodes delivered");
  }

  private async sendTelegramTo(userId: string, text: string, buttons: Array<{ text: string; url: string }>): Promise<boolean> {
    if (!this.telegramReady) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, telegramChatId: true, telegramBlockedAt: true, notifyTelegram: true },
    });
    const chat = user?.telegramChatId ?? user?.telegramId;
    if (!user || !chat || !user.notifyTelegram || user.telegramBlockedAt) return false;
    const result = await this.call("sendMessage", {
      chat_id: chat,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
    });
    if (result.ok) return true;
    // Blocked, or never pressed Start: stop until they do.
    if (result.error_code === 403 || result.error_code === 400) {
      await this.prisma.user.update({ where: { id: userId }, data: { telegramBlockedAt: new Date() } });
    }
    return false;
  }

  private async pushTo(
    userId: string,
    payload: { title: string; body: string; url: string; icon?: string | undefined; tag?: string },
  ): Promise<number> {
    if (!this.pushReady) return 0;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notifyPush: true } });
    if (!user?.notifyPush) return 0;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    for (const sub of subs) if (await this.sendPush(sub, payload)) sent += 1;
    return sent;
  }

  private async sendPush(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string; url: string; icon?: string | undefined; tag?: string },
  ): Promise<boolean> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600, urgency: "normal" },
      );
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // Gone at the browser's end (unsubscribed, cleared): forgotten here too.
      if (status === 404 || status === 410) await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      else this.log.warn({ status, err: (error as Error).message }, "push failed");
      return false;
    }
  }

  // ---- the bot -------------------------------------------------------------

  private async call(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<TgResult> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.config.telegramToken}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(20_000),
      });
      const json = (await res.json()) as TgResult;
      if (!json.ok && json.error_code === 429) {
        await sleep(((json.parameters?.retry_after as number | undefined) ?? 3) * 1000);
        return this.call(method, body, signal);
      }
      return json;
    } catch (error) {
      if ((error as Error).name !== "AbortError") this.log.warn({ method, err: (error as Error).message }, "telegram call failed");
      return { ok: false };
    }
  }

  async botUsername(): Promise<string | null> {
    if (this.botName || !this.telegramReady) return this.botName;
    const me = await this.call("getMe", {});
    this.botName = me.ok ? ((me.result as { username?: string }).username ?? null) : null;
    return this.botName;
  }

  /** Reads the bot's chats (/start CODE, /start, /stop, /status) until stopped. */
  startPolling(): void {
    if (!this.telegramReady || !this.config.telegramPolling || this.polling) return;
    this.polling = true;
    this.stopPolling = new AbortController();
    const signal = this.stopPolling.signal;
    void (async () => {
      let offset = 0;
      await this.call("setMyCommands", {
        commands: [
          { command: "start", description: "Подключить уведомления о новых сериях" },
          { command: "status", description: "Что сейчас включено" },
          { command: "stop", description: "Не присылать новые серии" },
        ],
      });
      while (!signal.aborted) {
        const res = await this.call("getUpdates", { offset, timeout: 50, allowed_updates: ["message", "my_chat_member"] }, AbortSignal.any([signal, AbortSignal.timeout(65_000)]));
        if (!res.ok) {
          // 409: another copy is reading (a deploy's trial run) — wait it out.
          await sleep(res.error_code === 409 ? 30_000 : 5_000);
          continue;
        }
        for (const update of (res.result as TgUpdate[]) ?? []) {
          offset = update.update_id + 1;
          await this.onUpdate(update).catch((error: unknown) => this.log.warn({ err: (error as Error).message }, "telegram update failed"));
        }
      }
    })();
  }

  stop(): void {
    this.stopPolling?.abort();
    this.polling = false;
  }

  private async onUpdate(update: TgUpdate): Promise<void> {
    const member = update.my_chat_member;
    if (member && member.chat.type === "private") {
      const chat = String(member.chat.id);
      const blocked = member.new_chat_member.status === "kicked";
      await this.prisma.user.updateMany({
        where: { OR: [{ telegramChatId: chat }, { telegramId: chat, telegramChatId: null }] },
        data: { telegramBlockedAt: blocked ? new Date() : null },
      });
      return;
    }
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== "private") return;
    const chat = String(msg.chat.id);
    const [command, arg] = msg.text.trim().split(/\s+/, 2);
    const settingsUrl = `${this.config.appUrl}/profile?studio=notify`;
    const owner = () =>
      this.prisma.user.findFirst({ where: { OR: [{ telegramChatId: chat }, { telegramId: chat }] }, select: { id: true, displayName: true, notifyTelegram: true } });

    if (command === "/start" && arg) {
      const link = await this.prisma.telegramLinkCode.findUnique({ where: { code: arg } });
      if (!link || link.expiresAt < new Date()) {
        await this.reply(chat, "Ссылка устарела. Откройте настройки уведомлений на сайте и нажмите «Подключить Telegram» ещё раз.", [{ text: "Настройки", url: settingsUrl }]);
        return;
      }
      // One chat, one account.
      await this.prisma.$transaction([
        this.prisma.user.updateMany({ where: { telegramChatId: chat, id: { not: link.userId } }, data: { telegramChatId: null } }),
        this.prisma.user.update({ where: { id: link.userId }, data: { telegramChatId: chat, telegramBlockedAt: null, notifyTelegram: true } }),
        this.prisma.telegramLinkCode.delete({ where: { code: arg } }),
      ]);
      const user = await this.prisma.user.findUnique({ where: { id: link.userId }, select: { displayName: true } });
      await this.reply(
        chat,
        `✅ Готово, <b>${escapeHtml(user?.displayName ?? "")}</b>! Сюда будут приходить новые серии аниме из «Смотрю», «В планах» и «Отложено».\n\nОтключить: /stop или в настройках на сайте.`,
        [{ text: "Мой список", url: `${this.config.appUrl}/library` }],
      );
      return;
    }
    if (command === "/start") {
      const user = await owner();
      if (user) {
        await this.prisma.user.update({ where: { id: user.id }, data: { telegramBlockedAt: null, notifyTelegram: true } });
        await this.reply(chat, `🔔 Уведомления о новых сериях включены, <b>${escapeHtml(user.displayName)}</b>.\nОтключить: /stop`);
      } else {
        await this.reply(chat, "Привет! Я присылаю новые серии аниме из вашего списка на AnimeShadow.\n\nЧтобы подключиться, откройте настройки уведомлений на сайте и нажмите «Подключить Telegram».", [
          { text: "Подключить на сайте", url: settingsUrl },
        ]);
      }
      return;
    }
    if (command === "/stop") {
      const user = await owner();
      if (user) await this.prisma.user.update({ where: { id: user.id }, data: { notifyTelegram: false } });
      await this.reply(chat, "🔕 Больше не пишу о новых сериях. Включить снова: /start или в настройках на сайте.", [{ text: "Настройки", url: settingsUrl }]);
      return;
    }
    if (command === "/status") {
      const user = await owner();
      await this.reply(
        chat,
        user
          ? `Аккаунт: <b>${escapeHtml(user.displayName)}</b>\nНовые серии в Telegram: ${user.notifyTelegram ? "включены ✅" : "выключены 🔕"}`
          : "Этот чат не подключён к аккаунту AnimeShadow.",
        [{ text: "Настройки", url: settingsUrl }],
      );
    }
  }

  private reply(chat: string, text: string, buttons: Array<{ text: string; url: string }> = []) {
    return this.call("sendMessage", {
      chat_id: chat,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [b]) } } : {}),
    });
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface TgResult {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface TgUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
  my_chat_member?: { chat: { id: number; type: string }; new_chat_member: { status: string } };
}
