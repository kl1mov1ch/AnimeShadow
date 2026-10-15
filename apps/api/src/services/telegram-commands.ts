import type { PrismaClient } from "@animeshadow/db";
import type { ScheduleItem } from "@animeshadow/shared";

/** A button under a bot message: a link, or a command run in place (callback). */
export type TgButton = { text: string; url: string } | { text: string; callback_data: string };

export interface BotAnswer {
  text: string;
  /** Rows of buttons. */
  keyboard?: TgButton[][];
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const STATUS_LABEL = { WATCHING: "Смотрю", PLANNED: "В планах", COMPLETED: "Просмотрено", ON_HOLD: "Отложено", DROPPED: "Брошено" } as const;

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
}

function hours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}

/** The commands' menu, shown under most answers. */
export const MENU: TgButton[][] = [
  [
    { text: "📊 Статистика", callback_data: "stats" },
    { text: "⭐ Избранное", callback_data: "favorites" },
  ],
  [
    { text: "▶️ Смотрю", callback_data: "watching" },
    { text: "🆕 Новые серии", callback_data: "new" },
  ],
  [
    { text: "📅 Расписание", callback_data: "schedule" },
    { text: "🎲 Что посмотреть", callback_data: "random" },
  ],
];

/** What the bot lists in Telegram's "/" menu. */
export const BOT_COMMANDS = [
  { command: "menu", description: "Меню" },
  { command: "stats", description: "Моя статистика просмотра" },
  { command: "favorites", description: "Избранное и лучшие оценки" },
  { command: "watching", description: "Что я смотрю — и где остановился" },
  { command: "new", description: "Новые серии из моего списка" },
  { command: "schedule", description: "Когда выйдут серии из моего списка" },
  { command: "random", description: "Что посмотреть из «В планах»" },
  { command: "status", description: "Какие уведомления включены" },
  { command: "start", description: "Включить уведомления о новых сериях" },
  { command: "stop", description: "Не присылать новые серии" },
  { command: "help", description: "Что умеет бот" },
];

/**
 * The bot's answers about one person's account: their numbers, favourites,
 * what they're watching (with a link back to the very episode), new
 * episodes waiting, the week's broadcasts of their titles, a pick from their
 * plans. Read straight from the database — the bot shows only the account
 * tied to the chat that asks.
 */
export class TelegramCommands {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appUrl: string,
    /** The broadcast schedule (this week and the next), when the API has one. */
    private readonly upcoming: () => Promise<ScheduleItem[]>,
  ) {}

  private href(a: { slug: string; id: number }, episode?: number): string {
    return `${this.appUrl}/anime/${a.slug || a.id}${episode ? `?ep=${episode}` : ""}#watch`;
  }

  private name(a: { title: string; titleLocalized: string | null }): string {
    return escapeHtml(a.titleLocalized || a.title);
  }

  async run(command: string, userId: string): Promise<BotAnswer | null> {
    switch (command) {
      case "stats":
        return this.stats(userId);
      case "favorites":
        return this.favorites(userId);
      case "watching":
        return this.watching(userId);
      case "new":
        return this.news(userId);
      case "schedule":
        return this.schedule(userId);
      case "random":
        return this.random(userId);
      case "menu":
      case "help":
        return this.help(userId);
      default:
        return null;
    }
  }

  async help(userId: string): Promise<BotAnswer> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, notifyTelegram: true } });
    return {
      text: [
        `👋 <b>${escapeHtml(user?.displayName ?? "")}</b>, вот что я умею:`,
        "",
        "📊 /stats — сколько вы посмотрели",
        "⭐ /favorites — избранное и лучшие оценки",
        "▶️ /watching — что смотрите и где остановились",
        "🆕 /new — новые серии из вашего списка",
        "📅 /schedule — когда выйдут серии на этой неделе",
        "🎲 /random — что посмотреть из «В планах»",
        "",
        `🔔 Уведомления о новых сериях: ${user?.notifyTelegram ? "включены (/stop — выключить)" : "выключены (/start — включить)"}`,
      ].join("\n"),
      keyboard: MENU,
    };
  }

  async stats(userId: string): Promise<BotAnswer> {
    const [user, watch, episodes, lists, scored, moments, comments, week] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, username: true, createdAt: true } }),
      this.prisma.watchSession.aggregate({ where: { userId }, _sum: { seconds: true } }),
      this.prisma.watchProgress.count({ where: { userId, completed: true } }),
      this.prisma.libraryEntry.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
      this.prisma.libraryEntry.aggregate({ where: { userId, score: { not: null } }, _avg: { score: true }, _count: { score: true } }),
      this.prisma.favoriteMoment.count({ where: { userId } }),
      this.prisma.comment.count({ where: { userId, deletedAt: null } }),
      this.prisma.watchSession.aggregate({ where: { userId, startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _sum: { seconds: true } }),
    ]);
    const by = new Map(lists.map((l) => [l.status, l._count._all]));
    const total = [...by.values()].reduce((n, v) => n + v, 0);
    const listLine = (Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>)
      .filter((s) => by.get(s))
      .map((s) => `${STATUS_LABEL[s]}: <b>${by.get(s)}</b>`)
      .join(" · ");
    const days = user ? Math.max(1, Math.round((Date.now() - user.createdAt.getTime()) / 86_400_000)) : 0;
    return {
      text: [
        `📊 <b>Статистика ${escapeHtml(user?.displayName ?? "")}</b>
`,
        `⏱ Всего: <b>${hours(watch._sum.seconds ?? 0)}</b> (за 7 дней — ${hours(week._sum.seconds ?? 0)})`,
        `🎞 Досмотрено серий: <b>${episodes}</b>`,
        `✅ Просмотрено тайтлов: <b>${by.get("COMPLETED") ?? 0}</b>`,
        `📚 В списке: <b>${total}</b>${listLine ? `\n${listLine}` : ""}`,
        scored._count.score ? `⭐ Средняя оценка: <b>${(scored._avg.score ?? 0).toFixed(1)}</b> (${plural(scored._count.score, "оценка", "оценки", "оценок")})` : "⭐ Оценок пока нет",
        `💬 Комментариев: <b>${comments}</b> · 📌 Любимых моментов: <b>${moments}</b>`,
        days ? `📅 На сайте ${plural(days, "день", "дня", "дней")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      keyboard: [[{ text: "Открыть профиль", url: `${this.appUrl}/profile${user?.username ? `/${user.username}` : ""}` }], ...MENU],
    };
  }

  async favorites(userId: string): Promise<BotAnswer> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { favoriteAnimeIds: true } });
    const ids = user?.favoriteAnimeIds.slice(0, 10) ?? [];
    const [favs, top] = await Promise.all([
      ids.length
        ? this.prisma.anime.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, titleLocalized: true, score: true } })
        : Promise.resolve([]),
      this.prisma.libraryEntry.findMany({
        where: { userId, score: { not: null } },
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
        take: 5,
        select: { score: true, anime: { select: { id: true, slug: true, title: true, titleLocalized: true } } },
      }),
    ]);
    const ordered = ids.map((id) => favs.find((a) => a.id === id)).filter((a): a is (typeof favs)[number] => a != null);
    const lines = ["⭐ <b>Избранное</b>", ""];
    if (ordered.length) ordered.forEach((a, i) => lines.push(`${i + 1}. <a href="${this.href(a)}">${this.name(a)}</a>${a.score ? ` · ${a.score.toFixed(1)}` : ""}`));
    else lines.push("Пока пусто — добавьте любимые аниме в профиле.");
    if (top.length) {
      lines.push("", "🏆 <b>Ваши лучшие оценки</b>");
      for (const t of top) lines.push(`${t.score}/10 — <a href="${this.href(t.anime)}">${this.name(t.anime)}</a>`);
    }
    return { text: lines.join("\n"), keyboard: MENU };
  }

  async watching(userId: string): Promise<BotAnswer> {
    const rows = await this.prisma.libraryEntry.findMany({
      where: { userId, status: "WATCHING" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { progress: true, anime: { select: { id: true, slug: true, title: true, titleLocalized: true, episodes: true } } },
    });
    if (rows.length === 0) {
      return { text: "▶️ В «Смотрю» пока ничего нет.\nДобавьте аниме в список на сайте — и я напомню о новых сериях.", keyboard: [[{ text: "Каталог", url: `${this.appUrl}/browse` }], ...MENU] };
    }
    // Where each was left: the latest episode they opened.
    const progress = await this.prisma.watchProgress.findMany({
      where: { userId, animeId: { in: rows.map((r) => r.anime.id) } },
      orderBy: { updatedAt: "desc" },
      select: { animeId: true, episode: true, completed: true },
    });
    const last = new Map<number, { episode: number; completed: boolean }>();
    for (const p of progress) if (!last.has(p.animeId)) last.set(p.animeId, p);
    const lines = ["▶️ <b>Смотрю</b>", ""];
    const keyboard: TgButton[][] = [];
    for (const r of rows) {
      const p = last.get(r.anime.id);
      const next = p ? (p.completed ? p.episode + 1 : p.episode) : Math.max(1, r.progress + 1);
      const done = r.anime.episodes != null && next > r.anime.episodes;
      lines.push(`• <b>${this.name(r.anime)}</b> — ${r.anime.episodes ? `${r.progress}/${r.anime.episodes}` : `${r.progress} сер.`}${done ? " ✅" : ` · дальше ${next}-я`}`);
      if (!done && keyboard.length < 4) keyboard.push([{ text: `▶ ${(r.anime.titleLocalized || r.anime.title).slice(0, 26)} · ${next} серия`, url: this.href(r.anime, next) }]);
    }
    return { text: lines.join("\n"), keyboard: [...keyboard, ...MENU] };
  }

  async news(userId: string): Promise<BotAnswer> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (rows.length === 0) return { text: "🆕 Новых серий нет — всё просмотрено. Я напишу, как только выйдет новая.", keyboard: MENU };
    const anime = await this.prisma.anime.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.animeId))] } },
      select: { id: true, slug: true, title: true, titleLocalized: true },
    });
    const byId = new Map(anime.map((a) => [a.id, a]));
    const lines = [`🆕 <b>Новые серии</b> (${rows.length})`, ""];
    const keyboard: TgButton[][] = [];
    for (const r of rows) {
      const a = byId.get(r.animeId);
      if (!a) continue;
      const ep = r.fromEpisode ?? r.episode;
      lines.push(`• <a href="${this.href(a, ep)}">${this.name(a)}</a> — ${r.fromEpisode != null ? `серии ${r.fromEpisode}–${r.episode}` : `${r.episode} серия`}`);
      if (keyboard.length < 3) keyboard.push([{ text: `▶ ${(a.titleLocalized || a.title).slice(0, 26)} · ${ep}`, url: this.href(a, ep) }]);
    }
    return { text: lines.join("\n"), keyboard: [...keyboard, ...MENU] };
  }

  async schedule(userId: string): Promise<BotAnswer> {
    const [items, mine] = await Promise.all([
      this.upcoming().catch(() => [] as ScheduleItem[]),
      this.prisma.libraryEntry.findMany({ where: { userId, status: { in: ["WATCHING", "PLANNED", "ON_HOLD"] } }, select: { animeId: true } }),
    ]);
    const ids = new Set(mine.map((m) => m.animeId));
    const now = Date.now();
    const soon = items
      .filter((i) => ids.has(i.anime.id) && new Date(i.airingAt).getTime() > now - 3_600_000)
      .sort((a, b) => a.airingAt.localeCompare(b.airingAt))
      .slice(0, 12);
    if (soon.length === 0) {
      return { text: "📅 На этой и следующей неделе серий из вашего списка не ожидается.", keyboard: [[{ text: "Всё расписание", url: `${this.appUrl}/schedule` }], ...MENU] };
    }
    const when = (iso: string) =>
      new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return {
      text: [
        "📅 <b>Ближайшие серии из вашего списка</b> (время МСК, выход в Японии; с озвучкой обычно позже)",
        "",
        ...soon.map((i) => `• ${when(i.airingAt)} — <b>${this.name(i.anime)}</b>, ${i.episode}${i.episodes ? `/${i.episodes}` : ""} серия`),
      ].join("\n"),
      keyboard: [[{ text: "Всё расписание", url: `${this.appUrl}/schedule` }], ...MENU],
    };
  }

  async random(userId: string): Promise<BotAnswer> {
    const planned = await this.prisma.libraryEntry.findMany({
      where: { userId, status: "PLANNED" },
      select: { anime: { select: { id: true, slug: true, title: true, titleLocalized: true, score: true, episodes: true, synopsis: true } } },
      take: 200,
    });
    if (planned.length === 0) {
      return { text: "🎲 В «В планах» пусто. Загляните в каталог — там есть подборки на любой вкус.", keyboard: [[{ text: "Каталог", url: `${this.appUrl}/browse` }], ...MENU] };
    }
    const a = planned[Math.floor(Math.random() * planned.length)]!.anime;
    const about = a.synopsis ? escapeHtml(a.synopsis.length > 300 ? `${a.synopsis.slice(0, 300).replace(/\s+\S*$/, "")}…` : a.synopsis) : "";
    return {
      text: [
        `🎲 Из ваших планов: <b>${this.name(a)}</b>`,
        [a.score ? `⭐ ${a.score.toFixed(1)}` : "", a.episodes ? plural(a.episodes, "серия", "серии", "серий") : ""].filter(Boolean).join(" · "),
        about ? `\n${about}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      keyboard: [
        [{ text: "▶ Смотреть", url: this.href(a, 1) }],
        [{ text: "🎲 Другое", callback_data: "random" }],
        ...MENU,
      ],
    };
  }
}
