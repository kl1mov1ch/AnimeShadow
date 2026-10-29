import type { PrismaClient } from "@animeshadow/db";
import {
  type AnimeSummary,
  genreSlug,
  isStudioName,
  studioSlug,
  type LandingPage,
  landingPath,
  parseLandingPath,
  seasonNameRu,
  seasonOf,
  shiftSeason,
} from "@animeshadow/shared";
import { env } from "../config/env.js";
import { contentGuardWhere } from "../lib/content-guard.js";
import { TtlCache } from "../lib/cache.js";
import type { LandingService } from "../services/landing.service.js";
import { dubStudios, STUDIO_MIN_TITLES } from "../services/dub-studios.js";
import { BRAND, SITE, absolute, clip, esc, jsonLd, plural } from "./html.js";
import { fillShell } from "./template.js";

/**
 * What search engines get for every page of the site: the app's own shell
 * with a real title, description, canonical address, robots rule, social
 * cards, Schema.org data — and the page's content as plain, readable HTML
 * inside #root (names, alternative titles, genres, synopsis, links), which
 * the app replaces with itself the moment it starts. Every visitor gets the
 * same HTML; nothing is shown only to robots.
 *
 * Yandex reads little JavaScript, so without this every page of a
 * single-page app looks the same to it: an empty <div>.
 */
export interface RenderedPage {
  status: number;
  html?: string;
  /** A permanent redirect to the canonical address instead of a page. */
  redirect?: string;
}

/**
 * A page before it goes into the app's shell — what is cached. The shell is
 * put around it on every request: it names the build's scripts, and a page
 * cached with the previous build's shell sent people to scripts a deploy
 * had just moved away — the old site, or a blank one, for minutes.
 */
interface PagePart {
  status: number;
  head?: string;
  body?: string;
  redirect?: string;
}

interface PageModel {
  status?: number;
  title: string;
  description: string;
  /** Path of the canonical address; omitted for pages that aren't indexed. */
  canonical?: string;
  robots?: "index" | "noindex" | "noindex-nofollow";
  image?: string | null;
  /** More pictures for previews (og:image can repeat): a poster after a wide frame. */
  moreImages?: string[];
  /** Search phrases this page answers (Yandex still reads them). */
  keywords?: string[];
  /** The main picture's size, when known — lets a preview draw it at once. */
  imageSize?: { width: number; height: number };
  ogType?: "website" | "video.tv_show" | "video.movie" | "video.episode" | "article" | "profile";
  jsonLd?: unknown[];
  /** Fetched before the app's script asks for them: the page's data, its first big picture. */
  preloads?: Array<{ href: string; as: "fetch" | "image"; media?: string; high?: boolean }>;
  body: string;
}

export interface SeoRendererDeps {
  prisma: PrismaClient;
  landing: LandingService;
  /** For the home page's hero: its data and first frame are preloaded. */
  catalog?: { getDiscover: (lang: "ru", allowAdult: boolean) => Promise<{ spotlights?: Array<{ screenshots: string[] }> | null; spotlight?: { screenshots: string[] } | null }> };
  logger?: { warn: (obj: unknown, msg?: string) => void };
}

/** The hosts the app's imageSrc sends through /api/img (keep in step with web/src/lib/format.ts). */
const PROXY_HOSTS =
  /(^|\.)(shikimori\.(io|one|org|me)|kp\.yandex\.net|mds\.yandex\.net|nekos\.best|anilist\.co|myanimelist\.net|kitsu\.(app|io))$/i;

/** The exact address the app's hero asks for its first frame at this width. */
function heroFrame(url: string, width: 640 | 1280): string | null {
  try {
    const parsed = new URL(url);
    if (!PROXY_HOSTS.test(parsed.hostname)) return null;
    return `/api/img?u=${encodeURIComponent(parsed.toString())}&w=${width}`;
  } catch {
    return null;
  }
}

const DEFAULT_IMAGE = "/icons/icon-512.png";
/** The frame search page is hidden on the site for now. */
const FRAME_SEARCH_PAGE = false;
/** Pages a search engine has no business indexing. */
const PRIVATE = [
  /^\/library\/?$/,
  /^\/admin\/?$/,
  /^\/profile\/?$/,
  /^\/login\/?$/,
  /^\/register\/?$/,
  /^\/verify-email\/?$/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/recommendations\/?$/,
  /^\/collections\/new\/?$/,
  /^\/collections\/stats\/?$/,
  /^\/collections\/[^/]+\/edit\/?$/,
];

export class SeoRenderer {
  private readonly logger: SeoRendererDeps["logger"];
  private readonly prisma: PrismaClient;
  private readonly landing: LandingService;
  private readonly catalog: SeoRendererDeps["catalog"];
  private readonly cache = new TtlCache<PagePart>(5 * 60_000, 2000);

  constructor(deps: SeoRendererDeps) {
    this.logger = deps.logger;
    this.prisma = deps.prisma;
    this.landing = deps.landing;
    this.catalog = deps.catalog;
  }

  async render(url: string): Promise<RenderedPage> {
    const [rawPath = "/", rawSearch = ""] = url.split("?");
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPath) || "/";
    } catch {
      pathname = rawPath || "/";
    }
    // Only what the pages read: `page`, and whether any filter is set at
    // all (filtered catalogue pages are noindex). Keyed on the raw query, a
    // `?x=1`, `?x=2`… loop made every request a fresh, uncached render.
    const params = new URLSearchParams(rawSearch);
    const pageParam = params.get("page");
    const kept = [
      pageParam && /^\d{1,4}$/.test(pageParam) ? `page=${pageParam}` : null,
      [...params.keys()].some((key) => key !== "page") ? "filtered=1" : null,
    ].filter(Boolean);
    const search = kept.length > 0 ? `?${kept.join("&")}` : "";
    const part = await this.cache.wrap(`${pathname}${search}`, () =>
      this.renderUncached(pathname, search, `${rawPath || "/"}${search}`),
    );
    if (part.redirect) return { status: part.status, redirect: part.redirect };
    return { status: part.status, html: fillShell(part.head ?? defaultHead(), part.body ?? "") };
  }

  private async renderUncached(pathname: string, search: string, address: string): Promise<PagePart> {
    try {
      const outcome = await this.route(pathname, search);
      if ("redirect" in outcome) return { status: 301, redirect: outcome.redirect };
      return { status: outcome.status ?? 200, head: this.head(outcome, address), body: outcome.body };
    } catch (error) {
      this.logger?.warn({ error, pathname }, "SEO page rendering failed");
      // Never a broken page because of SEO: the bare shell still runs the app.
      const fallback = { title: "AnimeShadow — страница временно недоступна", description: "Обновите страницу чуть позже.", robots: "noindex" as const, body: layout("<h1>Информация временно недоступна</h1><p>Попробуйте обновить страницу чуть позже.</p>") };
      return { status: 503, head: this.head(fallback, address), body: fallback.body };
    }
  }

  // -- routing -------------------------------------------------------------

  private async route(pathname: string, search: string): Promise<PageModel | { redirect: string }> {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    if (PRIVATE.some((re) => re.test(path))) return this.privatePage();
    // /index.html is the home page too: an installed copy of the app (the
    // old service worker) fetches it by that name, and a 404 here failed
    // every update of it — people kept the old site for good.
    if (path === "/" || path === "/index.html") return this.home();

    const episodePage = /^\/anime\/([^/]+)\/episode\/(\d{1,4})$/.exec(path);
    if (episodePage) return this.episode(episodePage[1]!, Number(episodePage[2]), path);
    const anime = /^\/anime\/([^/]+)(?:\/[^/]+)?$/.exec(path);
    if (anime) return this.anime(anime[1]!, path);

    // Old genre links by Russian name → the slug address.
    const oldGenre = /^\/genre\/([^/]+)$/.exec(path);
    if (oldGenre && !/^[a-z0-9-]+$/.test(oldGenre[1]!)) {
      const genres = await this.landing.genres();
      const name = oldGenre[1]!.toLowerCase();
      const match = genres.find((g) => g.name.toLowerCase() === name);
      return match ? { redirect: landingPath({ kind: "genre", genre: match.slug }) } : this.notFound();
    }

    const landing = parseLandingPath(path, search);
    if (landing) {
      const page = await this.landing.page(landing);
      return page && (page.items.length > 0 || page.page === 1) ? this.landingPage(page) : this.notFound();
    }

    if (path === "/browse") return this.browse(search);
    if (path === "/collections") return this.collections();
    const collection = /^\/collections\/([^/]+)$/.exec(path);
    if (collection) return this.collection(collection[1]!);
    const profile = /^\/profile\/([^/]+)$/.exec(path);
    if (profile) return this.profile(profile[1]!);
    // Hidden on the site for now (FEATURES.frameSearch in the web app).
    if (path === "/frame-search") return FRAME_SEARCH_PAGE ? this.frameSearch() : { redirect: "/" };
    if (path === "/about") return this.about();
    if (path === "/studio/hon-kon/workspace") return { redirect: "/studio/hon-kon/releases" };
    if (path === "/studio/hon-kon" || path === "/studio/hon-kon/releases") return {
      title: path.endsWith("releases") ? "Все релизы Hon-Kon Studio | AnimeShadow" : "Hon-Kon Studio — команда, релизы и озвучка | AnimeShadow",
      description: "Познакомьтесь с командой Hon-Kon Studio: голоса, перевод, звук и аниме на AnimeShadow.",
      canonical: path,
      body: layout("<h1>Hon-Kon Studio × AnimeShadow</h1><p>Любительская озвучка аниме. Релизы, команда и новости студии.</p><a href='/studio/hon-kon/releases'>Все релизы</a>"),
    };
    if (path === "/support") return this.support();
    if (path === "/studios") return this.studios();
    if (path === "/schedule") return this.schedule();
    if (path === "/party") return {
      title: `Смотреть аниме вместе с друзьями онлайн — комнаты совместного просмотра | ${BRAND}`,
      description: "Совместный просмотр аниме: создайте комнату, позовите друзей по ссылке и смотрите синхронно — с чатом, реакциями и общей паузой. Бесплатно.",
      keywords: ["смотреть аниме вместе", "совместный просмотр аниме", "аниме с друзьями онлайн", "watch party аниме"],
      canonical: "/party",
      body: layout(`${crumbs([["Главная", "/"]], "Смотреть вместе")}<h1>Смотреть аниме вместе</h1><p>Комнаты совместного просмотра: одна серия на всех экранах, чат и реакции. Создайте комнату на странице любого аниме и отправьте ссылку друзьям.</p>`),
    };
    const studio = /^\/studios\/([a-z0-9-]{1,60})$/.exec(path);
    if (studio) return /^hon-?kon/.test(studio[1]!) ? { redirect: "/studio/hon-kon" } : this.studio(studio[1]!, search);
    return this.notFound();
  }

  // -- pages ---------------------------------------------------------------

  private async home(): Promise<PageModel> {
    const [ongoing, top, popular, genres, discover] = await Promise.all([
      this.landing.page({ kind: "ongoing" }, false),
      this.landing.page({ kind: "top" }, false),
      this.landing.page({ kind: "popular" }, false),
      this.landing.genres(),
      this.catalog?.getDiscover("ru", false).catch(() => null) ?? Promise.resolve(null),
    ]);
    // The hero waits on its data and then its first frame: both start with the HTML instead.
    const shot = (discover?.spotlights?.[0] ?? discover?.spotlight)?.screenshots?.[0];
    const phone = shot ? heroFrame(shot, 640) : null;
    const wide = shot ? heroFrame(shot, 1280) : null;
    const preloads: NonNullable<PageModel["preloads"]> = [
      { href: "/api/discover?lang=ru", as: "fetch" },
      ...(phone ? [{ href: phone, as: "image" as const, media: "(max-width: 768px)", high: true }] : []),
      ...(wide ? [{ href: wide, as: "image" as const, media: "(min-width: 769px)", high: true }] : []),
    ];
    const now = seasonOf(new Date());
    const seasons = [0, -1, -2, -3].map((d) => shiftSeason(now, d));
    return {
      title: `Смотреть аниме онлайн бесплатно в хорошем качестве — ${BRAND}`,
      keywords: [
        "смотреть аниме онлайн бесплатно",
        "аниме онлайн",
        "аниме смотреть онлайн в хорошем качестве",
        "аниме с русской озвучкой",
        "аниме бесплатно без регистрации",
        "новые серии аниме",
        "онгоинги",
        "топ аниме",
        "аниме сериалы",
        "аниме фильмы",
        `аниме ${new Date().getFullYear()}`,
        "смотреть аниме вместе с друзьями",
      ],
      description:
        "Смотрите аниме онлайн бесплатно: онгоинги и новые серии каждую неделю, топ аниме, фильмы и сериалы с русской озвучкой и субтитрами. Каталог с удобным поиском и своим списком просмотра.",
      canonical: "/",
      ogType: "website",
      preloads,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: BRAND,
          url: `${SITE}/`,
          inLanguage: "ru",
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE}/browse?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: BRAND,
          url: `${SITE}/`,
          logo: absolute(DEFAULT_IMAGE),
        },
      ],
      body: layout(`
        <h1>Смотреть аниме онлайн бесплатно</h1>
        <p>${esc(BRAND)} — каталог аниме на русском: онгоинги с новыми сериями каждую неделю, топ аниме всех времён, фильмы и сериалы с русской озвучкой и субтитрами, свой список просмотра и прогресс по сериям.</p>
        ${section("Онгоинги — выходят сейчас", "/ongoing", ongoing?.items.slice(0, 18) ?? [])}
        ${section("Популярные аниме", "/popular", popular?.items.slice(0, 18) ?? [])}
        ${section("Топ аниме всех времён", "/top", top?.items.slice(0, 18) ?? [])}
        <h2>Аниме по сезонам</h2>
        ${links(seasons.map((s) => ({ href: landingPath({ kind: "season", ...s }), label: `Аниме ${seasonNameRu(s.season, "gen")} ${s.year}` })))}
        <h2>Аниме по жанрам</h2>
        ${links(genres.slice(0, 30).map((g) => ({ href: landingPath({ kind: "genre", genre: g.slug }), label: g.name })))}
      `),
    };
  }

  private async anime(param: string, path: string): Promise<PageModel | { redirect: string }> {
    const id = /^(\d+)/.exec(param)?.[1];
    const row = await this.prisma.anime.findFirst({
      where: id ? { OR: [{ slug: param }, { id: Number(id) }] } : { slug: param },
      include: { genres: { include: { genre: true } } },
    });
    if (!row) return this.notFound();
    const canonical = `/anime/${row.slug}`;
    if (path !== canonical) return { redirect: canonical };

    const name = row.titleLocalized ?? row.title;
    // Hentai has no page at all; R+ (ecchi) is a normal page with an 18+ mark.
    const adult = /^rx/i.test(row.rating ?? "");
    const r18 = /^r\+/i.test(row.rating ?? "");
    const genres = row.genres.map((g) => g.genre.name);
    const altNames = altNamesOf(row, name);
    const kind = row.type === "MOVIE" ? "аниме-фильм" : row.type === "TV" ? "аниме-сериал" : "аниме";
    const typeRu = TYPE_RU[row.type] ?? "Аниме";
    const yearPart = row.year ? ` (${row.year})` : "";
    const poster = row.imageLargeUrl ?? row.imageUrl;

    if (adult) {
      // Behind the age check on the site itself, so not for search results.
      return {
        title: `${name}${yearPart} | ${BRAND}`,
        description: `${name} — ${typeRu.toLowerCase()}${yearPart}.`,
        robots: "noindex",
        body: layout(`<h1>${esc(name)}</h1>`),
      };
    }

    const [[dubs, released], similar, comments, ourRating, availability] = await Promise.all([
      this.prisma.playerSource
        .findMany({ where: { animeId: row.id }, select: { title: true, kind: true, episodesCount: true }, take: 40 })
        .then((rows) => [
          [...new Set(rows.filter((r) => r.kind !== "subtitles").map((r) => dubName(r.title)).filter((n): n is string => n != null))].slice(0, 15),
          Math.min(EPISODE_PAGES_MAX, Math.max(0, ...rows.map((r) => r.episodesCount ?? 0))),
        ] as const),
      this.similar(row.id, row.genres.map((g) => g.genreId)),
      this.prisma.comment.findMany({
        where: { animeId: row.id, deletedAt: null, mode: "PUBLIC", parentId: null },
        orderBy: { likeCount: "desc" },
        take: 5,
        select: { body: true, createdAt: true, user: { select: { displayName: true } } },
      }),
      this.prisma.libraryEntry.aggregate({ where: { animeId: row.id, score: { not: null } }, _avg: { score: true }, _count: { score: true } }),
      this.prisma.watchAvailability.findUnique({ where: { animeId: row.id }, select: { hasPlayer: true } }),
    ]);
    const canWatch = availability?.hasPlayer === true && row.airing !== "UPCOMING";

    const episodes = row.episodes ?? null;
    const facts: Array<[string, string]> = [
      ["Тип", typeRu],
      ...(row.year
        ? [
            [
              "Год",
              row.season
                ? `<a href="${landingPath({ kind: "season", year: row.year, season: row.season })}">${esc(seasonNameRu(row.season))} ${row.year}</a>`
                : `<a href="${landingPath({ kind: "year", year: row.year })}">${row.year}</a>`,
            ] as [string, string],
          ]
        : []),
      ["Статус", AIRING_RU[row.airing] ?? "—"],
      ...(episodes ? [["Эпизоды", esc(plural(episodes, "серия", "серии", "серий"))] as [string, string]] : []),
      ...(row.duration ? [["Длительность", esc(row.duration)] as [string, string]] : []),
      ...(row.studios.length ? [["Студия", esc(row.studios.join(", "))] as [string, string]] : []),
      ...(genres.length
        ? [
            [
              "Жанры",
              genres
                .map((g) => {
                  const slug = genreSlug(g);
                  return slug ? `<a href="/genre/${slug}">${esc(g)}</a>` : esc(g);
                })
                .join(", "),
            ] as [string, string],
          ]
        : []),
      ...(row.rating ? [["Возрастной рейтинг", esc(row.rating)] as [string, string]] : []),
      ...(row.score != null ? [["Оценка зрителей", `${row.score.toFixed(2)} из 10${row.scoredBy ? ` (${esc(row.scoredBy.toLocaleString("ru-RU"))} голосов)` : ""}`] as [string, string]] : []),
    ];

    const description = clip(
      `${canWatch ? "Смотрите" : "Информация про"} ${kind} «${name}»${yearPart}${canWatch ? " онлайн на AnimeShadow" : ""}${episodes ? `: ${plural(episodes, "серия", "серии", "серий")}` : ""}. ${row.synopsis ?? ""}`,
      190,
    );
    const ratingCount = ourRating._count.score;
    const showEpisodes = canWatch && row.type !== "MOVIE" && released > 1;
    const faq = animeFaq({ name, type: row.type, airing: row.airing, episodes, released, dubs, canWatch, year: row.year, genres, studios: row.studios });
    // A wide frame of the show (with the site's mark, 1280 px) leads previews
    // in search and messengers — a poster is cut to a square there.
    const frames = row.screenshots.slice(0, 6);
    const wide = (src: string) => `${SITE}/api/img?u=${encodeURIComponent(src)}&w=1280&wm=1&f=jpg`;
    const lead = frames[0] ? wide(frames[0]) : row.bannerImage ?? poster;
    const watchUrl = `${SITE}${canonical}#watch`;

    return {
      // The way the first page of results reads: the name, then exactly what
      // people type after it — "смотреть онлайн", "все серии", "бесплатно".
      title: canWatch
        ? row.type === "MOVIE"
          ? `${name}${yearPart} — смотреть аниме-фильм онлайн бесплатно | ${BRAND}`
          : `${name}${yearPart} смотреть онлайн все серии бесплатно | ${BRAND}`
        : `${name}${yearPart} — дата выхода, описание, серии | ${BRAND}`,
      description: clip(`${r18 ? "18+ · " : ""}${row.score != null && row.score > 0 ? `★ ${row.score.toFixed(1)}/10 · ` : ""}${description}`, 200),
      canonical,
      image: lead,
      moreImages: poster && lead !== poster ? [poster] : [],
      imageSize: frames[0] ? { width: 1280, height: 720 } : undefined,
      keywords: [
        `${name} смотреть онлайн`,
        `${name} смотреть онлайн бесплатно`,
        ...(row.type !== "MOVIE" ? [`${name} все серии`] : [`${name} фильм`]),
        `аниме ${name}`,
        ...(row.year ? [`${name} ${row.year}`] : []),
        ...altNames.slice(0, 3).map((a) => `${a} смотреть онлайн`),
        ...dubs.slice(0, 3).map((d) => `${name} озвучка ${d}`),
        ...genres.slice(0, 3).map((g) => `аниме ${g.toLowerCase()}`),
        "смотреть аниме онлайн бесплатно",
        "аниме с русской озвучкой",
      ],
      ogType: row.type === "MOVIE" ? "video.movie" : "video.tv_show",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": row.type === "MOVIE" ? "Movie" : "TVSeries",
          name,
          ...(altNames.length ? { alternateName: altNames } : {}),
          url: `${SITE}${canonical}`,
          ...(poster ? { image: absolute(poster) } : {}),
          ...(row.synopsis ? { description: clip(row.synopsis, 500) } : {}),
          ...(genres.length ? { genre: genres } : {}),
          ...(row.airedFrom ? { datePublished: row.airedFrom.toISOString().slice(0, 10) } : {}),
          ...(row.type !== "MOVIE" && episodes ? { numberOfEpisodes: episodes } : {}),
          ...(row.studios.length ? { productionCompany: row.studios.map((s) => ({ "@type": "Organization", name: s })) } : {}),
          inLanguage: "ja",
          ...(canWatch ? { potentialAction: { "@type": "WatchAction", target: watchUrl } } : {}),
          ...(row.rating ? { contentRating: row.rating } : {}),
          // Only our own viewers' scores — never another site's rating.
          ...(ratingCount >= 3 && ourRating._avg.score != null
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: Math.round(ourRating._avg.score * 10) / 10,
                  ratingCount,
                  bestRating: 10,
                  worstRating: 1,
                },
              }
            : {}),
        },
        breadcrumbs([
          ["Главная", "/"],
          ["Каталог", "/browse"],
          [name, canonical],
        ]),
        ...(faq.length ? [faqLd(faq)] : []),
      ],
      body: layout(`
        ${crumbs([["Главная", "/"], ["Каталог", "/browse"]], name)}
        <article class="ssr-anime">
          ${poster ? `<img class="ssr-poster" src="${esc(poster)}" alt="${esc(`${name} — постер`)}" width="225" height="318" />` : ""}
          <div>
            <h1>${esc(name)}${esc(yearPart)}</h1>
            ${altNames.length ? `<p class="ssr-muted">${esc(altNames.join(" · "))}</p>` : ""}
            <p>${canWatch ? `Доступен просмотр на ${esc(BRAND)}.` : "Информация об аниме. Доступность видео уточняется в плеере."}${dubs.length && canWatch ? ` Озвучки: ${dubs.map((d) => { const slug = studioSlug(d); return slug && isStudioName(d) ? `<a href="/studios/${esc(slug)}">${esc(d)}</a>` : esc(d); }).join(", ")}.` : ""}</p>
            <dl class="ssr-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
          </div>
        </article>
        ${row.synopsis ? `<h2>Сюжет</h2><p>${esc(row.synopsis)}</p>` : ""}
        ${row.background ? `<p>${esc(clip(row.background, 800))}</p>` : ""}
        ${showEpisodes ? `<h2>Смотреть «${esc(name)}» по сериям</h2>${episodeLinks(row.slug, released)}` : ""}
        ${faqHtml(name, faq)}
        ${comments.length ? `<h2>Отзывы зрителей</h2>${comments.map((c) => `<blockquote><p>${esc(clip(c.body, 400))}</p><footer>— ${esc(c.user.displayName)}</footer></blockquote>`).join("")}` : ""}
        ${similar.length ? section("Похожие аниме", null, similar) : ""}
      `),
    };
  }

  private landingPage(page: LandingPage): PageModel {
    const path = landingPath({ ...page.params });
    const pages = Math.max(1, Math.ceil(page.total / page.perPage));
    const base = landingPath({ ...page.params, page: 1 });
    const crumbTrail: Array<[string, string]> = [["Главная", "/"], ["Каталог", "/browse"]];
    return {
      title: page.copy.title,
      description: page.copy.description,
      keywords: [
        page.copy.title.split(" | ")[0]!.split(" — ")[0]!.toLowerCase(),
        `${page.copy.title.split(" | ")[0]!.split(" — ")[0]!.toLowerCase()} смотреть онлайн`,
        "смотреть аниме онлайн бесплатно",
        "аниме с русской озвучкой",
      ],
      canonical: path,
      robots: page.total === 0 ? "noindex" : "index",
      image: page.items[0]?.imageLargeUrl ?? page.items[0]?.imageUrl ?? null,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: page.copy.h1,
          numberOfItems: page.total,
          itemListElement: page.items.map((a, i) => ({
            "@type": "ListItem",
            position: (page.page - 1) * page.perPage + i + 1,
            url: `${SITE}/anime/${a.slug}`,
            name: a.titleLocalized ?? a.title,
          })),
        },
        breadcrumbs([...crumbTrail, [page.copy.h1, base]]),
      ],
      body: layout(`
        ${crumbs(crumbTrail, page.copy.h1)}
        <h1>${esc(page.copy.h1)}</h1>
        <p>${esc(page.copy.intro)}</p>
        <p class="ssr-muted">${esc(plural(page.total, "тайтл", "тайтла", "тайтлов"))}${pages > 1 ? ` · страница ${page.page} из ${pages}` : ""}</p>
        ${grid(page.items)}
        ${pager(base, page.page, pages)}
        ${page.related.length ? `<h2>Смотрите также</h2>${links(page.related)}` : ""}
      `),
    };
  }

  private async browse(search: string): Promise<PageModel> {
    const requested = new URLSearchParams(search).get("page");
    const pageNumber = requested == null ? 1 : Number(requested);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 2000) return this.notFound();
    const page = await this.landing.page({ kind: "popular", page: pageNumber });
    if (pageNumber > 1 && !page?.items.length) return this.notFound();
    // The catalogue with filters or a search is endless combinations of the
    // same titles: followed, not indexed — the clean landings carry that.
    const filtered = /[?&](?!page=)[^=&]+=/.test(search);
    return {
      title: `Каталог аниме${pageNumber > 1 ? ` — страница ${pageNumber}` : " — смотреть аниме онлайн бесплатно"} | ${BRAND}`,
      description:
        "Каталог аниме с фильтрами по жанру, году, сезону, рейтингу и числу серий. Тысячи аниме-сериалов и фильмов — смотрите онлайн бесплатно.",
      canonical: !filtered && pageNumber > 1 ? `/browse?page=${pageNumber}` : "/browse",
      robots: filtered ? "noindex" : "index",
      body: layout(`
        <h1>Каталог аниме</h1>
        <p>Тысячи аниме-сериалов, фильмов и OVA с фильтрами по жанру, году, сезону, рейтингу и длине.</p>
        ${links([
          { href: "/top", label: "Топ аниме" },
          { href: "/ongoing", label: "Онгоинги" },
          { href: "/popular", label: "Популярные" },
          { href: "/movies", label: "Аниме-фильмы" },
          { href: "/announced", label: "Анонсы" },
        ])}
        ${grid(page?.items ?? [])}
        ${page ? links([
          ...(pageNumber > 1 ? [{ href: pageNumber === 2 ? "/browse" : `/browse?page=${pageNumber - 1}`, label: "Предыдущая страница" }] : []),
          ...(pageNumber * page.perPage < page.total ? [{ href: `/browse?page=${pageNumber + 1}`, label: "Следующая страница" }] : []),
        ]) : ""}
      `),
    };
  }

  private async collections(): Promise<PageModel> {
    const rows = await this.prisma.collection.findMany({
      where: { published: true },
      orderBy: [{ viewCount: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: { id: true, title: true, summary: true, animeIds: true, user: { select: { displayName: true } } },
    });
    return {
      title: `Подборки аниме от зрителей — что посмотреть | ${BRAND}`,
      description:
        "Подборки аниме от зрителей: списки с историей — почему стоит посмотреть каждый тайтл. Уютное, мрачное, до слёз, для новичков и не только.",
      canonical: "/collections",
      body: layout(`
        <h1>Подборки аниме от зрителей</h1>
        <p>Списки аниме с историей: авторы объясняют, почему советуют каждый тайтл.</p>
        <ul class="ssr-list">${rows
          .map(
            (c) =>
              `<li><a href="/collections/${esc(c.id)}"><strong>${esc(c.title)}</strong></a> — ${esc(plural(c.animeIds.length, "аниме", "аниме", "аниме"))}, автор ${esc(c.user.displayName)}${c.summary ? `. ${esc(clip(c.summary, 160))}` : ""}</li>`,
          )
          .join("")}</ul>
      `),
    };
  }

  private async collection(id: string): Promise<PageModel> {
    const row = await this.prisma.collection.findFirst({
      where: { id, published: true },
      select: { id: true, title: true, summary: true, blocks: true, animeIds: true, createdAt: true, updatedAt: true, user: { select: { displayName: true } } },
    });
    if (!row) return this.notFound();
    const anime = await this.prisma.anime.findMany({
      where: { AND: [{ id: { in: row.animeIds } }, contentGuardWhere(true)] },
      select: { id: true, slug: true, title: true, titleLocalized: true, year: true, imageUrl: true },
    });
    const byId = new Map(anime.map((a) => [a.id, a]));
    const blocks = (Array.isArray(row.blocks) ? row.blocks : []) as Array<{ type: string; text?: string; animeId?: number; note?: string }>;
    const canonical = `/collections/${row.id}`;
    const items = row.animeIds.map((aid) => byId.get(aid)).filter((a): a is NonNullable<typeof a> => a != null);
    return {
      title: `${row.title} — подборка аниме | ${BRAND}`,
      description: clip(row.summary || `Подборка аниме «${row.title}» от ${row.user.displayName}: ${items.slice(0, 5).map((a) => a.titleLocalized ?? a.title).join(", ")}.`, 180),
      canonical,
      ogType: "article",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: row.title,
          ...(row.summary ? { description: clip(row.summary, 300) } : {}),
          itemListElement: items.map((a, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/anime/${a.slug}`, name: a.titleLocalized ?? a.title })),
        },
        breadcrumbs([
          ["Главная", "/"],
          ["Подборки", "/collections"],
          [row.title, canonical],
        ]),
      ],
      body: layout(`
        ${crumbs([["Главная", "/"], ["Подборки", "/collections"]], row.title)}
        <h1>${esc(row.title)}</h1>
        <p class="ssr-muted">Подборка от ${esc(row.user.displayName)} · ${esc(plural(items.length, "аниме", "аниме", "аниме"))}</p>
        ${row.summary ? `<p>${esc(row.summary)}</p>` : ""}
        ${blocks
          .map((b) => {
            if (b.type === "text" && b.text) return `<p>${esc(b.text)}</p>`;
            if (b.type === "heading" && b.text) return `<h2>${esc(b.text)}</h2>`;
            if ((b.type === "quote" || b.type === "callout") && b.text) return `<p>${esc(b.text)}</p>`;
            const a = b.animeId != null ? byId.get(b.animeId) : undefined;
            if (!a) return "";
            const title = a.titleLocalized ?? a.title;
            return `<h2><a href="/anime/${esc(a.slug)}">${esc(title)}${a.year ? ` (${a.year})` : ""}</a></h2>${b.note ? `<p>${esc(b.note)}</p>` : ""}`;
          })
          .join("")}
      `),
    };
  }

  private async profile(username: string): Promise<PageModel> {
    const user = await this.prisma.user.findFirst({ where: { username }, select: { displayName: true } });
    if (!user) return this.notFound();
    return {
      title: `${user.displayName} — профиль на ${BRAND}`,
      description: `Профиль ${user.displayName} на ${BRAND}: список аниме, достижения и подборки.`,
      robots: "noindex",
      ogType: "profile",
      body: layout(`<h1>${esc(user.displayName)}</h1>`),
    };
  }

  private frameSearch(): PageModel {
    return {
      title: `Поиск аниме по кадру — найти аниме по скриншоту или картинке | ${BRAND}`,
      description:
        "Найдите аниме по кадру: загрузите скриншот или картинку, и мы покажем, из какого это аниме, какой серии и на какой минуте.",
      canonical: "/frame-search",
      body: layout(`
        <h1>Поиск аниме по кадру</h1>
        <p>Загрузите скриншот и выделите область с аниме. При совпадении покажем название, серию и момент. Сильная обрезка, надписи и фильтры могут мешать распознаванию.</p>
      `),
    };
  }

  private about(): PageModel {
    return {
      title: `О проекте ${BRAND}`,
      description: `${BRAND} — каталог аниме на русском: смотреть онлайн, вести свой список и прогресс по сериям, подборки и рейтинги зрителей.`,
      canonical: "/about",
      body: layout(`<h1>О проекте ${esc(BRAND)}</h1><p>Каталог аниме на русском: смотреть онлайн, вести свой список просмотра и прогресс по сериям, читать и составлять подборки.</p>`),
    };
  }

  private support(): PageModel {
    return {
      title: `Поддержка и PRO — ${BRAND}`,
      description: `Как поддержать ${BRAND}, что даёт PRO и как с нами связаться.`,
      canonical: "/support",
      body: layout(`<h1>Поддержка проекта</h1><p>Как поддержать ${esc(BRAND)}, что даёт PRO и как с нами связаться.</p>`),
    };
  }

  private async schedule(): Promise<PageModel> {
    const ongoing = await this.landing.page({ kind: "ongoing" }, false);
    return {
      title: `Расписание выхода аниме на неделю — новые серии онгоингов | ${BRAND}`,
      description: "Расписание выхода новых серий аниме по дням недели: когда выйдет следующая серия онгоинга, по московскому времени. Подпишитесь — пришлём уведомление о новой серии.",
      keywords: ["расписание аниме", "расписание выхода аниме", "когда выйдет новая серия аниме", "онгоинги расписание"],
      canonical: "/schedule",
      jsonLd: [breadcrumbs([["Главная", "/"], ["Расписание", "/schedule"]])],
      body: layout(`
        ${crumbs([["Главная", "/"]], "Расписание")}
        <h1>Расписание выхода аниме</h1>
        <p>Новые серии онгоингов по дням недели, по московскому времени.</p>
        ${section("Сейчас выходят", "/ongoing", ongoing?.items.slice(0, 24) ?? [])}
      `),
    };
  }

  /**
   * One episode's own page — /anime/<slug>/episode/<n>. "<название> 5 серия"
   * is how most people search once a show is running, and the sites at the
   * top of those results answer each episode at its own address. Only
   * episodes some player has; past that, there is no page.
   */
  private async episode(param: string, n: number, path: string): Promise<PageModel | { redirect: string }> {
    const id = /^(\d+)/.exec(param)?.[1];
    const row = await this.prisma.anime.findFirst({
      where: { AND: [id ? { OR: [{ slug: param }, { id: Number(id) }] } : { slug: param }, contentGuardWhere(false)] },
    });
    if (!row) return this.notFound();
    const base = `/anime/${row.slug}`;
    if (row.type === "MOVIE") return { redirect: base };
    const canonical = `${base}/episode/${n}`;
    if (path !== canonical) return { redirect: canonical };
    const sources = await this.prisma.playerSource.findMany({
      where: { animeId: row.id, kind: { not: "subtitles" } },
      select: { title: true, episodesCount: true, episodeMeta: true },
      take: 40,
    });
    const released = Math.min(EPISODE_PAGES_MAX, Math.max(0, ...sources.map((s) => s.episodesCount ?? 0)));
    if (n < 1 || n > released) return this.notFound();

    const name = row.titleLocalized ?? row.title;
    const meta = sources
      .map((s) => (s.episodeMeta as Record<string, { title?: string | null; durationSeconds?: number | null }> | null)?.[String(n)])
      .find((m) => m?.title || m?.durationSeconds);
    const episodeTitle = meta?.title?.trim() || null;
    const minutes = meta?.durationSeconds ? Math.round(meta.durationSeconds / 60) : null;
    const dubs = [...new Set(sources.filter((s) => (s.episodesCount ?? 0) >= n).map((s) => dubName(s.title)).filter((d): d is string => d != null))].slice(0, 8);
    const altNames = altNamesOf(row, name);
    const poster = row.imageLargeUrl ?? row.imageUrl;
    const frame = row.screenshots.length ? row.screenshots[(n - 1) % row.screenshots.length] : undefined;
    const image = frame ? `${SITE}/api/img?u=${encodeURIComponent(frame)}&w=1280&wm=1&f=jpg` : poster;
    const total = row.episodes && row.episodes >= released ? row.episodes : released;
    const isLast = n === released;
    const dubLinks = dubs.map((d) => { const slug = studioSlug(d); return slug && isStudioName(d) ? `<a href="/studios/${esc(slug)}">${esc(d)}</a>` : esc(d); }).join(", ");

    return {
      title: `${name} ${n} серия — смотреть онлайн бесплатно${row.year ? ` (${row.year})` : ""} | ${BRAND}`,
      description: clip(
        `Смотрите ${n} серию аниме «${name}» онлайн бесплатно в хорошем качестве${dubs.length ? ` в озвучке ${dubs.slice(0, 3).join(", ")}` : ""}.${episodeTitle ? ` Серия «${episodeTitle}».` : ""} ${row.airing === "AIRING" && isLast ? "Новая серия — уже на сайте. " : ""}Всего ${plural(total, "серия", "серии", "серий")}.`,
        200,
      ),
      canonical,
      image,
      imageSize: frame ? { width: 1280, height: 720 } : undefined,
      keywords: [
        `${name} ${n} серия`,
        `${name} ${n} серия смотреть онлайн`,
        `${name} ${n} серия смотреть бесплатно`,
        ...altNames.slice(0, 2).map((alt) => `${alt} ${n} серия`),
        ...altNames.slice(0, 1).map((alt) => `${alt} episode ${n}`),
        ...dubs.slice(0, 2).map((dub) => `${name} ${n} серия ${dub}`),
      ],
      ogType: "video.episode",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "TVEpisode",
          name: episodeTitle ? `${n} серия — ${episodeTitle}` : `${name} — ${n} серия`,
          episodeNumber: n,
          url: `${SITE}${canonical}`,
          ...(image ? { image: absolute(image) } : {}),
          ...(minutes ? { timeRequired: `PT${minutes}M` } : {}),
          inLanguage: "ja",
          partOfSeries: { "@type": "TVSeries", name, url: `${SITE}${base}`, ...(altNames.length ? { alternateName: altNames } : {}) },
          potentialAction: { "@type": "WatchAction", target: `${SITE}${canonical}#watch` },
        },
        breadcrumbs([["Главная", "/"], [name, base], [`${n} серия`, canonical]]),
      ],
      body: layout(`
        ${crumbs([["Главная", "/"], [name, base]], `${n} серия`)}
        <h1>${esc(name)} — ${n} серия</h1>
        ${episodeTitle ? `<p><strong>«${esc(episodeTitle)}»</strong>${minutes ? ` · ${minutes} мин.` : ""}</p>` : ""}
        <p>Смотрите ${n} серию аниме «${esc(name)}» онлайн бесплатно${dubs.length ? ` в озвучке ${dubLinks}` : ""}. Вышло ${esc(plural(released, "серия", "серии", "серий"))}${row.episodes && row.episodes > released ? ` из ${row.episodes}` : ""}.</p>
        ${altNames.length ? `<p class="ssr-muted">${esc(altNames.join(" · "))}</p>` : ""}
        <nav class="ssr-pager" aria-label="Серии">${n > 1 ? `<a href="${esc(base)}/episode/${n - 1}" rel="prev">← ${n - 1} серия</a>` : ""}<a href="${esc(base)}">Об аниме</a>${n < released ? `<a href="${esc(base)}/episode/${n + 1}" rel="next">${n + 1} серия →</a>` : ""}</nav>
        ${row.synopsis ? `<h2>О чём аниме «${esc(name)}»</h2><p>${esc(clip(row.synopsis, 600))}</p>` : ""}
        <h2>Все серии</h2>
        ${episodeLinks(row.slug, released, n)}
      `),
    };
  }

  private async studios(): Promise<PageModel> {
    const { list } = await dubStudios(this.prisma);
    const studios = list.filter((studio) => studio.count >= STUDIO_MIN_TITLES);
    const top = studios.slice(0, 8).map((studio) => studio.name);
    return {
      title: `Студии озвучки аниме — ${top.slice(0, 3).join(", ")} и другие | ${BRAND}`,
      description: `Аниме с русской озвучкой по студиям: ${top.join(", ")}. Выберите студию и смотрите всё аниме в её озвучке онлайн бесплатно.`,
      keywords: ["студии озвучки аниме", "аниме с русской озвучкой", ...top.slice(0, 6).map((name) => `аниме в озвучке ${name}`)],
      canonical: "/studios",
      jsonLd: [breadcrumbs([["Главная", "/"], ["Студии озвучки", "/studios"]])],
      body: layout(`
        ${crumbs([["Главная", "/"]], "Студии озвучки")}
        <h1>Студии озвучки аниме</h1>
        <p>Всё аниме по студиям озвучки: выберите, чьими голосами смотреть.</p>
        <ul class="ssr-list">${studios
          .map((studio) => `<li><a href="/studios/${esc(studio.slug)}"><strong>${esc(studio.name)}</strong></a> — ${esc(plural(studio.count, "аниме", "аниме", "аниме"))}</li>`)
          .join("")}<li><a href="/studio/hon-kon"><strong>Hon-Kon Studio</strong></a> — команда и релизы студии</li></ul>
      `),
    };
  }

  private async studio(slug: string, search: string): Promise<PageModel> {
    const { list, names } = await dubStudios(this.prisma);
    const studio = list.find((entry) => entry.slug === slug);
    const titles = names.get(slug);
    if (!studio || !titles) return this.notFound();
    const params = new URLSearchParams(search);
    const page = Math.min(500, Math.max(1, Number(params.get("page")) || 1));
    const where = { AND: [contentGuardWhere(false), { playerSources: { some: { title: { in: titles } } } }] };
    const [total, rows] = await Promise.all([
      this.prisma.anime.count({ where }),
      this.prisma.anime.findMany({
        where,
        orderBy: [{ members: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        skip: (page - 1) * 48,
        take: 48,
        select: { slug: true, title: true, titleLocalized: true, year: true, imageUrl: true },
      }),
    ]);
    const pages = Math.max(1, Math.ceil(total / 48));
    if (page > pages) return this.notFound();
    const name = studio.name;
    const examples = rows.slice(0, 4).map((a) => a.titleLocalized ?? a.title);
    const base = `/studios/${slug}`;
    return {
      title: `Аниме в озвучке ${name} — смотреть онлайн${page > 1 ? `, страница ${page}` : ""} | ${BRAND}`,
      description: `Все аниме в озвучке ${name}: ${plural(total, "тайтл", "тайтла", "тайтлов")} — ${examples.join(", ")} и другие. Смотрите онлайн бесплатно в хорошем качестве.`,
      keywords: [`аниме в озвучке ${name}`, `${name} озвучка`, `${name} аниме смотреть онлайн`, ...examples.slice(0, 3).map((title) => `${title} ${name}`)],
      canonical: page > 1 ? `${base}?page=${page}` : base,
      robots: /filtered=1/.test(search) ? "noindex" : "index",
      image: studio.posters[0] ?? null,
      jsonLd: [
        breadcrumbs([["Главная", "/"], ["Студии озвучки", "/studios"], [name, base]]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `Аниме в озвучке ${name}`,
          url: `${SITE}${base}`,
          about: { "@type": "Organization", name },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: total,
            itemListElement: rows.slice(0, 24).map((a, i) => ({ "@type": "ListItem", position: (page - 1) * 48 + i + 1, url: `${SITE}/anime/${a.slug}`, name: a.titleLocalized ?? a.title })),
          },
        },
      ],
      body: layout(`
        ${crumbs([["Главная", "/"], ["Студии озвучки", "/studios"]], name)}
        <h1>Аниме в озвучке ${esc(name)}</h1>
        <p>${esc(plural(total, "аниме", "аниме", "аниме"))} с русской озвучкой студии ${esc(name)}: сериалы, фильмы и онгоинги. Смотрите онлайн бесплатно.</p>
        ${grid(rows)}
        ${pager(base, page, pages)}
      `),
    };
  }

  private privatePage(): PageModel {
    return { title: BRAND, description: "", robots: "noindex-nofollow", body: "" };
  }

  private notFound(): PageModel {
    return {
      status: 404,
      title: `Страница не найдена | ${BRAND}`,
      description: "Такой страницы нет. Загляните в каталог, топ аниме или онгоинги.",
      robots: "noindex",
      body: layout(`<h1>Страница не найдена</h1>${links([
        { href: "/", label: "На главную" },
        { href: "/browse", label: "Каталог" },
        { href: "/top", label: "Топ аниме" },
        { href: "/ongoing", label: "Онгоинги" },
      ])}`),
    };
  }

  /** Titles sharing the most genres with this one, most popular first. */
  private async similar(animeId: number, genreIds: number[]): Promise<AnimeSummary[]> {
    if (genreIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ animeId: number }>>`
      SELECT g."animeId"
      FROM "GenreOnAnime" g JOIN "Anime" a ON a.id = g."animeId"
      WHERE g."genreId" = ANY(${genreIds}) AND g."animeId" <> ${animeId}
        AND (a.rating IS NULL OR (a.rating NOT ILIKE 'rx%'))
      GROUP BY g."animeId", a.members
      ORDER BY COUNT(*) DESC, a.members DESC NULLS LAST
      LIMIT 12
    `;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.animeId);
    const anime = await this.prisma.anime.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, title: true, titleLocalized: true, year: true, imageUrl: true, imageLargeUrl: true, type: true },
    });
    const byId = new Map(anime.map((a) => [a.id, a]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as unknown as AnimeSummary[];
  }

  // -- the document --------------------------------------------------------

  private head(page: PageModel, address: string): string {
    const robots =
      page.robots === "noindex-nofollow"
        ? "noindex, nofollow"
        : page.robots === "noindex"
          ? "noindex, follow"
          : "index, follow, max-image-preview:large, max-snippet:-1";
    const url = page.canonical ? `${SITE}${page.canonical}` : undefined;
    const image = absolute(page.image ?? DEFAULT_IMAGE);
    const tags = [
      `<title>${esc(page.title)}</title>`,
      page.description ? `<meta name="description" content="${esc(page.description)}" />` : "",
      page.keywords?.length ? `<meta name="keywords" content="${esc([...new Set(page.keywords)].join(", "))}" />` : "",
      `<meta name="robots" content="${robots}" />`,
      url ? `<link rel="canonical" href="${esc(url)}" />` : "",
      `<meta property="og:site_name" content="${BRAND}" />`,
      `<meta property="og:locale" content="ru_RU" />`,
      `<meta property="og:type" content="${page.ogType ?? "website"}" />`,
      `<meta property="og:title" content="${esc(page.title)}" />`,
      page.description ? `<meta property="og:description" content="${esc(page.description)}" />` : "",
      url ? `<meta property="og:url" content="${esc(url)}" />` : "",
      image ? `<meta property="og:image" content="${esc(image)}" />` : "",
      image && page.imageSize ? `<meta property="og:image:width" content="${page.imageSize.width}" />` : "",
      image && page.imageSize ? `<meta property="og:image:height" content="${page.imageSize.height}" />` : "",
      image ? `<meta property="og:image:alt" content="${esc(page.title)}" />` : "",
      ...(page.moreImages ?? []).map((m) => `<meta property="og:image" content="${esc(absolute(m))}" />`),
      `<meta name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${esc(page.title)}" />`,
      page.description ? `<meta name="twitter:description" content="${esc(page.description)}" />` : "",
      image ? `<meta name="twitter:image" content="${esc(image)}" />` : "",
      ...verificationTags(),
      ...(page.preloads ?? []).map(
        (p) =>
          `<link rel="preload" href="${esc(p.href)}" as="${p.as}"${p.as === "fetch" ? " crossorigin" : ""}${p.media ? ` media="${esc(p.media)}"` : ""}${p.high ? ' fetchpriority="high"' : ""} />`,
      ),
      // Which address this head was made for: the app leaves it alone there.
      `<meta name="seo-path" content="${esc(address)}" />`,
      ...(page.jsonLd ?? []).map((d) => `<script type="application/ld+json" data-seo-ssr="1">${jsonLd(d)}</script>`),
      SNAPSHOT_STYLE,
    ];
    return tags.filter(Boolean).join("\n    ");
  }
}

// -- pieces of HTML ----------------------------------------------------------

const TYPE_RU: Record<string, string> = {
  TV: "ТВ-сериал",
  MOVIE: "Фильм",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Спешл",
  MUSIC: "Клип",
};
/** A dub's studio name as people search for it, or null for the provider's
 *  placeholders ("Озвучка 158 · Alloha", a lone letter). */
function dubName(title: string): string | null {
  const name = title.replace(/\s*·\s*(alloha|kodik)\s*$/i, "").trim();
  if (name.length < 3 || /^(озвучка|субтитры|voice|sub)\s*\d*$/i.test(name) || /^\d+$/.test(name)) return null;
  return name;
}

/** Episode pages beyond this are not made (no show is longer; a bad count would be). */
export const EPISODE_PAGES_MAX = 3000;

/** Every name the show is searched by: original, English, Japanese, synonyms. */
function altNamesOf(row: { title: string; titleEnglish: string | null; titleJapanese: string | null; titleSynonyms?: string[] }, name: string): string[] {
  return [...new Set([row.title, row.titleEnglish, row.titleJapanese, ...(row.titleSynonyms ?? []).slice(0, 4)]
    .map((t) => t?.trim())
    .filter((t): t is string => !!t && t.toLowerCase() !== name.toLowerCase()))].slice(0, 7);
}

/** Links to every episode page — on a long show, the first ones, the ones around `current`, every fiftieth and the last ones. */
function episodeLinks(slug: string, released: number, current?: number): string {
  const shown = new Set<number>();
  if (released <= 120) for (let i = 1; i <= released; i++) shown.add(i);
  else {
    for (let i = 1; i <= 20; i++) shown.add(i);
    if (current) for (let i = Math.max(1, current - 15); i <= Math.min(released, current + 15); i++) shown.add(i);
    for (let i = Math.max(1, released - 20); i <= released; i++) shown.add(i);
    for (let i = 50; i < released; i += 50) shown.add(i);
  }
  return `<ul class="ssr-links">${[...shown]
    .sort((a, b) => a - b)
    .map((i) => (i === current ? `<li><strong>${i} серия</strong></li>` : `<li><a href="/anime/${esc(slug)}/episode/${i}">${i} серия</a></li>`))
    .join("")}</ul>`;
}

type FaqItem = [question: string, answer: string];

/** The questions people actually type about a show, answered from what we know. */
function animeFaq(a: { name: string; type: string; airing: string; episodes: number | null; released: number; dubs: readonly string[]; canWatch: boolean; year: number | null; genres: string[]; studios: string[] }): FaqItem[] {
  const items: FaqItem[] = [];
  const movie = a.type === "MOVIE";
  if (a.canWatch) items.push([`Где смотреть аниме «${a.name}» онлайн бесплатно?`, `«${a.name}» можно смотреть онлайн бесплатно на ${BRAND}${movie ? "" : " — все вышедшие серии подряд"}, в хорошем качестве, с телефона, компьютера и телевизора.`]);
  if (!movie && (a.episodes || a.released)) {
    items.push([`Сколько серий в аниме «${a.name}»?`, a.airing === "AIRING"
      ? `Аниме ещё выходит: вышло ${plural(a.released, "серия", "серии", "серий")}${a.episodes ? `, всего планируется ${a.episodes}` : ""}. Новые серии появляются на сайте по мере выхода.`
      : `В аниме «${a.name}» ${plural(a.episodes ?? a.released, "серия", "серии", "серий")}.`]);
  }
  if (a.dubs.length) items.push([`В какой озвучке можно посмотреть «${a.name}»?`, `На ${BRAND} есть озвучки: ${a.dubs.slice(0, 8).join(", ")}. Озвучку можно сменить прямо в плеере.`]);
  if (a.airing === "UPCOMING") items.push([`Когда выйдет аниме «${a.name}»?`, a.year ? `Выход запланирован на ${a.year} год. Добавьте аниме в список — пришлём уведомление о первой серии.` : "Дата выхода пока не объявлена. Добавьте аниме в список — пришлём уведомление о первой серии."]);
  if (a.genres.length || a.studios.length) items.push([`Что за аниме «${a.name}»?`, `${movie ? "Аниме-фильм" : "Аниме-сериал"}${a.year ? ` ${a.year} года` : ""}${a.genres.length ? ` в жанрах: ${a.genres.slice(0, 4).join(", ").toLowerCase()}` : ""}${a.studios.length ? `. Студия-производитель — ${a.studios.join(", ")}` : ""}.`]);
  return items;
}

/** Shown on the page, not only in the markup: a search engine trusts answers people can read. */
function faqHtml(name: string, faq: FaqItem[]): string {
  if (faq.length === 0) return "";
  return `<h2>Вопросы об аниме «${esc(name)}»</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}`;
}

function faqLd(faq: FaqItem[]): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

const AIRING_RU: Record<string, string> = { AIRING: "Выходит", FINISHED: "Вышел", UPCOMING: "Анонс", UNKNOWN: "—" };

/** The readable page, kept visually quiet: the app replaces it on start. */
const SNAPSHOT_STYLE = `<style data-seo-ssr="1">
      .ssr{max-width:1200px;margin:0 auto;padding:24px 16px 48px;font:15px/1.6 Onest,system-ui,sans-serif;color:var(--foreground,#e8e8ee)}
      .ssr a{color:inherit;text-decoration:none}.ssr a:hover{text-decoration:underline}
      .ssr h1{font-size:28px;line-height:1.2;margin:8px 0 12px}.ssr h2{font-size:19px;margin:28px 0 10px}
      .ssr-muted,.ssr-crumbs{color:var(--muted-foreground,#969db0);font-size:13px}
      .ssr-anime{display:flex;gap:20px;align-items:flex-start}.ssr-poster{width:180px;height:auto;border-radius:12px;flex:none}
      .ssr-facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px}.ssr-facts dt{color:var(--muted-foreground,#969db0)}.ssr-facts dd{margin:0}
      .ssr-grid,.ssr-links,.ssr-list{list-style:none;padding:0;margin:0}
      .ssr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}
      .ssr-grid img{width:100%;height:auto;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#15161d}
      .ssr-grid span{display:block;font-size:13px;line-height:1.3;margin-top:6px}
      .ssr-links{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:14px}.ssr-list li{margin:6px 0}
      .ssr blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--primary,#ff4d6d)}
      .ssr nav.ssr-pager{display:flex;gap:10px;margin-top:20px}
      @media (max-width:640px){.ssr-anime{flex-direction:column}.ssr-poster{width:140px}}
    </style>`;

function layout(inner: string): string {
  const now = seasonOf(new Date());
  return `<main class="ssr">${inner}<footer class="ssr-muted" style="margin-top:40px">${links([
    { href: "/", label: BRAND },
    { href: "/browse", label: "Каталог аниме" },
    { href: "/top", label: "Топ аниме" },
    { href: "/ongoing", label: "Онгоинги" },
    { href: "/popular", label: "Популярные" },
    { href: "/movies", label: "Аниме-фильмы" },
    { href: landingPath({ kind: "season", ...now }), label: `Аниме ${seasonNameRu(now.season, "gen")} ${now.year}` },
    { href: landingPath({ kind: "year", year: now.year }), label: `Аниме ${now.year} года` },
    { href: "/collections", label: "Подборки" },
    { href: "/studios", label: "Студии озвучки" },
  ])}</footer></main>`;
}

function links(items: Array<{ href: string; label: string }>): string {
  return `<ul class="ssr-links">${items.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join("")}</ul>`;
}

function grid(items: Array<Pick<AnimeSummary, "slug" | "title" | "titleLocalized" | "year" | "imageUrl">>): string {
  return `<ul class="ssr-grid">${items
    .map((a) => {
      const title = a.titleLocalized ?? a.title;
      return `<li><a href="/anime/${esc(a.slug)}">${a.imageUrl ? `<img src="${esc(a.imageUrl)}" alt="${esc(title)}" loading="lazy" width="140" height="210" />` : ""}<span>${esc(title)}${a.year ? ` (${a.year})` : ""}</span></a></li>`;
    })
    .join("")}</ul>`;
}

function section(title: string, href: string | null, items: AnimeSummary[]): string {
  if (items.length === 0) return "";
  return `<h2>${href ? `<a href="${esc(href)}">${esc(title)}</a>` : esc(title)}</h2>${grid(items)}`;
}

function crumbs(trail: Array<[string, string]>, current: string): string {
  return `<nav class="ssr-crumbs" aria-label="Навигация">${trail.map(([l, h]) => `<a href="${esc(h)}">${esc(l)}</a> › `).join("")}<span>${esc(current)}</span></nav>`;
}

function breadcrumbs(trail: Array<[string, string]>): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` })),
  };
}

function pager(base: string, page: number, pages: number): string {
  if (pages <= 1) return "";
  const at = (n: number) => (n <= 1 ? base : `${base}?page=${n}`);
  return `<nav class="ssr-pager" aria-label="Страницы">${page > 1 ? `<a href="${esc(at(page - 1))}">← Назад</a>` : ""}${page < pages ? `<a href="${esc(at(page + 1))}">Дальше →</a>` : ""}</nav>`;
}

function verificationTags(): string[] {
  return [
    env.YANDEX_VERIFICATION ? `<meta name="yandex-verification" content="${esc(env.YANDEX_VERIFICATION)}" />` : "",
    env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(env.GOOGLE_SITE_VERIFICATION)}" />` : "",
    env.BING_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(env.BING_VERIFICATION)}" />` : "",
  ];
}

function defaultHead(): string {
  return [`<title>${BRAND}</title>`, ...verificationTags()].filter(Boolean).join("\n    ");
}
