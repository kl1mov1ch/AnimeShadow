import type { FastifyError, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { contentGuardWhere, resolveAllowAdult } from "../lib/content-guard.js";
import { NotFoundError } from "../lib/errors.js";
import { escapeTv as e, tvDocument } from "../lib/tv-mode.js";
import { parse } from "../lib/validation.js";
import { PAGE_CSP } from "../seo/csp.js";

const params = z.object({ id: z.coerce.number().int().positive() });
const query = z.object({ q: z.string().trim().max(120).default(""), page: z.coerce.number().int().min(1).max(500).default(1) });

export const tvRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (request.url.startsWith("/api/tv/sources/")) throw error;
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error }, "TV page failed");
    const message = status === 422 ? "Проверьте запрос: название до 120 символов, номер страницы от 1 до 500." : "Страница временно недоступна. Попробуйте открыть каталог ещё раз.";
    return reply.code(status).type("text/html; charset=utf-8").header("cache-control", "no-store").header("content-security-policy", PAGE_CSP).send(tvDocument("Не удалось открыть страницу", `<h1>Не удалось открыть страницу</h1><p>${message}</p><a class="primary" href="/tv">Вернуться в каталог</a>`));
  });
  app.get("/tv/sources/:id", { preHandler: app.optionalAuth }, async (request, reply) => {
    const { id } = parse(params, request.params);
    const allow = await resolveAllowAdult(app.prisma, request.userId);
    const anime = await app.prisma.anime.findFirst({ where: { id, ...contentGuardWhere(allow) }, select: { id: true } });
    if (!anime) throw new NotFoundError("Аниме не найдено");
    const response = await app.services.watch.getSources(id);
    reply.header("cache-control", "private, no-store");
    return { sourcesPending: response.sourcesPending, sources: response.sources.filter((source) => source.format === "hls" || source.format === "mp4") };
  });

  app.get("/tv", async (request, reply) => {
    const { q, page } = parse(query, request.query);
    const where = { AND: [contentGuardWhere(true), { watchAvailability: { hasCustomPlayer: true } }, ...(q ? [{ OR: ["title", "titleLocalized", "titleEnglish"].map((field) => ({ [field]: { contains: q, mode: "insensitive" as const } })) }] : [])] };
    const items = await app.prisma.anime.findMany({ where, select: { id: true, title: true, titleLocalized: true, imageUrl: true, year: true, score: true }, orderBy: [{ freshness: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 24 });
    const link = (p: number) => `/tv?q=${encodeURIComponent(q)}&amp;page=${p}`;
    const cards = items.slice(0, 24).map((a) => `<a class="card" href="/tv/anime/${a.id}">${a.imageUrl ? `<img src="/api/img?u=${encodeURIComponent(a.imageUrl)}&amp;w=384" alt="" loading="lazy">` : '<div class="poster-empty">影</div>'}<h2>${e(a.titleLocalized || a.title)}</h2><p>${e(a.year || "Аниме")}${a.score ? ` · ★ ${a.score.toFixed(1)}` : ""}</p></a>`).join("");
    const html = tvDocument("Каталог", `<h1>Аниме на большом экране</h1><form action="/tv" method="get"><label for="q">Найти аниме</label><div class="search"><input id="q" name="q" maxlength="120" value="${e(q)}" placeholder="Название аниме"><button>Найти</button></div></form><div class="grid">${cards || '<p role="status">Ничего не найдено. Попробуйте другое название.</p>'}</div><nav class="pages" aria-label="Страницы">${page > 1 ? `<a href="${link(page - 1)}">← Назад</a>` : ""}<span>Страница ${page}</span>${items.length > 24 ? `<a href="${link(page + 1)}">Дальше →</a>` : ""}</nav>`);
    return reply.type("text/html; charset=utf-8").header("cache-control", "no-cache").header("content-security-policy", PAGE_CSP).send(html);
  });

  app.get("/tv/anime/:id", async (request, reply) => {
    const { id } = parse(params, request.params);
    const a = await app.prisma.anime.findFirst({ where: { id, ...contentGuardWhere(true) }, select: { id: true, title: true, titleLocalized: true, synopsis: true, imageLargeUrl: true, imageUrl: true, year: true, episodes: true } });
    if (!a) return reply.code(404).type("text/html").send(tvDocument("Не найдено", '<h1>Аниме не найдено</h1><a href="/tv">Вернуться в каталог</a>'));
    const image = a.imageLargeUrl || a.imageUrl;
    const html = tvDocument(a.titleLocalized || a.title, `<div class="detail">${image ? `<img class="poster" src="/api/img?u=${encodeURIComponent(image)}&amp;w=384" alt="">` : ""}<div><h1>${e(a.titleLocalized || a.title)}</h1><p class="muted">${e(a.year || "Аниме")}${a.episodes ? ` · Серий: ${a.episodes}` : ""}</p><p class="synopsis">${e(a.synopsis?.replace(/<[^>]*>/g, "").slice(0, 650))}</p><a class="primary" href="#player">К просмотру ↓</a></div></div><section id="player" data-anime="${a.id}"><h2>影 Плеер AnimeShadow</h2><p id="status" role="status" aria-live="polite">Выберите «Загрузить озвучки», затем запустите серию.</p><button id="load">Загрузить озвучки</button><div id="choices" hidden><label for="source">Озвучка</label><select id="source"></select><label for="episode">Серия</label><select id="episode"></select><button id="start" class="primary">Смотреть</button></div><video id="video" controls playsinline preload="none" tabindex="0"${image ? ` poster="/api/img?u=${encodeURIComponent(image)}&amp;w=640"` : ""}></video><div class="controls"><button id="backward">−10 сек</button><button id="toggle">Пауза / пуск</button><button id="forward">+10 сек</button><button id="next">Следующая серия</button><button id="fullscreen">Полный экран</button></div><p class="muted">Если поток недоступен, выберите другую озвучку. Качество подбирается автоматически по скорости сети.</p><noscript>Для просмотра включите JavaScript в браузере телевизора. Каталог доступен без JavaScript.</noscript></section>`);
    return reply.type("text/html; charset=utf-8").header("cache-control", "no-cache").header("content-security-policy", PAGE_CSP).send(html);
  });
};
