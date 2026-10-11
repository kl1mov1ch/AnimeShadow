import type { PrismaClient } from "@animeshadow/db";
import {
  type AnimeSummary,
  genreSlug,
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
  ogType?: "website" | "video.tv_show" | "video.movie" | "article" | "profile";
  jsonLd?: unknown[];
  body: string;
}

export interface SeoRendererDeps {
  prisma: PrismaClient;
  landing: LandingService;
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
  private readonly prisma: PrismaClient;
  private readonly landing: LandingService;
  private readonly cache = new TtlCache<PagePart>(5 * 60_000, 2000);

  constructor(deps: SeoRendererDeps) {
    this.prisma = deps.prisma;
    this.landing = deps.landing;
  }

  async render(url: string): Promise<RenderedPage> {
    const [rawPath = "/", rawSearch = ""] = url.split("?");
    let pathname: string;
    try {
      pathname = decodeURIComponent(rawPath) || "/";
    } catch {
      pathname = rawPath || "/";
    }
    const search = rawSearch ? `?${rawSearch}` : "";
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
    } catch {
      // Never a broken page because of SEO: the bare shell still runs the app.
      return { status: 200 };
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
    if (path === "/support") return this.support();
    return this.notFound();
  }

  // -- pages ---------------------------------------------------------------

  private async home(): Promise<PageModel> {
    const [ongoing, top, popular, genres] = await Promise.all([
      this.landing.page({ kind: "ongoing" }),
      this.landing.page({ kind: "top" }),
      this.landing.page({ kind: "popular" }),
      this.landing.genres(),
    ]);
    const now = seasonOf(new Date());
    const seasons = [0, -1, -2, -3].map((d) => shiftSeason(now, d));
    return {
      title: `${BRAND} — смотреть аниме онлайн бесплатно в хорошем качестве`,
      description:
        "Смотрите аниме онлайн бесплатно: онгоинги и новые серии каждую неделю, топ аниме, фильмы и сериалы с русской озвучкой и субтитрами. Каталог с удобным поиском и своим списком просмотра.",
      canonical: "/",
      ogType: "website",
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
    const adult = /^(r\+|rx)/i.test(row.rating ?? "");
    const genres = row.genres.map((g) => g.genre.name);
    const altNames = [...new Set([row.title, row.titleEnglish, row.titleJapanese].filter((t): t is string => !!t && t !== name))];
    const kind = row.type === "MOVIE" ? "аниме-фильм" : row.type === "TV" ? "аниме-сериал" : "аниме";
    const typeRu = TYPE_RU[row.type] ?? "Аниме";
    const yearPart = row.year ? ` (${row.year})` : "";
    const poster = row.imageLargeUrl ?? row.imageUrl;

    if (adult) {
      // Behind the age check on the site itself, so not for search results.
      return {
        title: `${name}${yearPart} | ${BRAND}`,
        description: `${name} — ${typeRu.toLowerCase()}${yearPart}. Страница доступна после подтверждения возраста.`,
        robots: "noindex",
        body: layout(`<h1>${esc(name)}</h1><p>Страница доступна после подтверждения возраста.</p>`),
      };
    }

    const [dubs, similar, comments, ourRating] = await Promise.all([
      this.prisma.playerSource
        .findMany({ where: { animeId: row.id }, select: { title: true, kind: true }, take: 40 })
        .then((rows) => [...new Set(rows.filter((r) => r.kind !== "subtitles").map((r) => dubName(r.title)).filter((n): n is string => n != null))].slice(0, 15)),
      this.similar(row.id, row.genres.map((g) => g.genreId)),
      this.prisma.comment.findMany({
        where: { animeId: row.id, deletedAt: null, mode: "PUBLIC", parentId: null },
        orderBy: { likeCount: "desc" },
        take: 5,
        select: { body: true, createdAt: true, user: { select: { displayName: true } } },
      }),
      this.prisma.libraryEntry.aggregate({ where: { animeId: row.id, score: { not: null } }, _avg: { score: true }, _count: { score: true } }),
    ]);

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
      `Смотрите ${kind} «${name}»${yearPart} онлайн бесплатно в хорошем качестве${episodes ? `: ${plural(episodes, "серия", "серии", "серий")}` : ""}${dubs.length ? `, озвучка ${dubs.slice(0, 3).join(", ")}` : ""}. ${row.synopsis ?? ""}`,
      190,
    );
    const ratingCount = ourRating._count.score;

    return {
      title: `${name}${yearPart} — смотреть ${kind} онлайн бесплатно${row.type === "TV" ? ", все серии" : ""} | ${BRAND}`,
      description,
      canonical,
      image: poster,
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
          countryOfOrigin: { "@type": "Country", name: "Japan" },
          inLanguage: "ja",
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
      ],
      body: layout(`
        ${crumbs([["Главная", "/"], ["Каталог", "/browse"]], name)}
        <article class="ssr-anime">
          ${poster ? `<img class="ssr-poster" src="${esc(poster)}" alt="${esc(`${name} — постер`)}" width="225" height="318" />` : ""}
          <div>
            <h1>${esc(name)}${esc(yearPart)}</h1>
            ${altNames.length ? `<p class="ssr-muted">${esc(altNames.join(" · "))}</p>` : ""}
            <p>Смотреть ${esc(kind)} «${esc(name)}» онлайн бесплатно${episodes ? ` — ${esc(plural(episodes, "серия", "серии", "серий"))}` : ""}${dubs.length ? `, ${dubs.length > 1 ? "озвучки" : "озвучка"}: ${esc(dubs.join(", "))}` : ""}.</p>
            <dl class="ssr-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
          </div>
        </article>
        ${row.synopsis ? `<h2>Сюжет</h2><p>${esc(row.synopsis)}</p>` : ""}
        ${row.background ? `<p>${esc(clip(row.background, 800))}</p>` : ""}
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
    const page = await this.landing.page({ kind: "popular" });
    // The catalogue with filters or a search is endless combinations of the
    // same titles: followed, not indexed — the clean landings carry that.
    const filtered = /[?&](?!page=)[^=&]+=/.test(search);
    return {
      title: `Каталог аниме — смотреть аниме онлайн бесплатно | ${BRAND}`,
      description:
        "Каталог аниме с фильтрами по жанру, году, сезону, рейтингу и числу серий. Тысячи аниме-сериалов и фильмов — смотрите онлайн бесплатно.",
      canonical: "/browse",
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
      where: { AND: [{ id: { in: row.animeIds } }, contentGuardWhere(false)] },
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
        <p>Загрузите скриншот, кадр из видео или картинку — и узнайте, из какого это аниме, из какой серии и с какой минуты. Работает и по обрезанным кадрам.</p>
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
        AND (a.rating IS NULL OR (a.rating NOT ILIKE 'rx%' AND a.rating NOT ILIKE 'r+%'))
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
      `<meta name="robots" content="${robots}" />`,
      url ? `<link rel="canonical" href="${esc(url)}" />` : "",
      `<meta property="og:site_name" content="${BRAND}" />`,
      `<meta property="og:locale" content="ru_RU" />`,
      `<meta property="og:type" content="${page.ogType ?? "website"}" />`,
      `<meta property="og:title" content="${esc(page.title)}" />`,
      page.description ? `<meta property="og:description" content="${esc(page.description)}" />` : "",
      url ? `<meta property="og:url" content="${esc(url)}" />` : "",
      image ? `<meta property="og:image" content="${esc(image)}" />` : "",
      `<meta name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}" />`,
      `<meta name="twitter:title" content="${esc(page.title)}" />`,
      page.description ? `<meta name="twitter:description" content="${esc(page.description)}" />` : "",
      image ? `<meta name="twitter:image" content="${esc(image)}" />` : "",
      ...verificationTags(),
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
