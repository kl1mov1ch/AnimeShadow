import { AllohaClient } from "@animeshadow/alloha";
import { ScheduleService } from "./schedule.service.js";
import { DeliveryService } from "./delivery.service.js";
import { NotificationService } from "./notification.service.js";
import { isBackground } from "../lib/priority.js";
import { AniLibriaClient } from "@animeshadow/anilibria";
import { AniListClient } from "@animeshadow/anilist";
import { createPrismaClient, type PrismaClient } from "@animeshadow/db";
import { KodikClient } from "@animeshadow/kodik";
import { ShikimoriClient } from "@animeshadow/shikimori";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { setGaugeSource } from "../lib/metrics.js";
import { env } from "../config/env.js";
import { AchievementService } from "./achievement.service.js";
import { AdminService } from "./admin.service.js";
import { CollectionService } from "./collection.service.js";
import { FactsService } from "./facts.service.js";
import { AdminAnalyticsService } from "./admin-analytics.service.js";
import { KodikCatalogSync } from "./kodik-sync.service.js";
import { AnilibriaCatalogSync } from "./anilibria-sync.service.js";
import { LandingService } from "./landing.service.js";
import { SeoRenderer } from "../seo/render.js";
import { AnalyticsService } from "./analytics.service.js";
import { StatsRollupService } from "./stats-rollup.service.js";
import { HeroClipService } from "./hero-clip.service.js";
import { TitleNamesService } from "./title-names.service.js";
import { CuratedService } from "./curated.service.js";
import { AuthService } from "./auth.service.js";
import { CatalogService } from "./catalog.service.js";
import { CommentService } from "./comment.service.js";
import { EmailService } from "./email.service.js";
import { FrameService } from "./frame.service.js";
import { LibraryService } from "./library.service.js";
import { ProfileService } from "./profile.service.js";
import { ProgressService } from "./progress.service.js";
import { RecommendationService } from "./recommendation.service.js";
import { SearchService } from "./search.service.js";
import { TranslationService } from "./translation.service.js";
import { EpisodeInfoService } from "./episode-info.service.js";
import { ProfileInsightsService } from "./profile-insights.service.js";
import { SocialService } from "./social.service.js";
import {
  chainTranslators,
  GoogleTranslator,
  identityTranslator,
  MyMemoryTranslator,
} from "./translator.js";
import { WatchService } from "./watch.service.js";

export interface ContainerDeps {
  prisma: PrismaClient;
  logger: FastifyBaseLogger;
  cacheTtlSeconds: number;
  proForAll: boolean;
  translate: { enabled: boolean; email?: string | undefined };
  shikimori: { baseUrl: string; userAgent: string };
  watch: {
    kodikToken: string;
    kodikBase: string;
    allohaToken: string;
    embedTemplate?: string | undefined;
    kodikDirectToken?: string | undefined;
  };
  telegramBotToken?: string | undefined;
  telegramPolling?: boolean;
  vapid?: { publicKey?: string | undefined; privateKey?: string | undefined; subject: string };
  traceMoeApiKey?: string | undefined;
  adminEmails: string[];
  email: {
    apiKey?: string | undefined;
    from: string;
    appUrl: string;
  };
}

export interface Services {
  catalog: CatalogService;
  auth: AuthService;
  library: LibraryService;
  watch: WatchService;
  search: SearchService;
  frames: FrameService;
  progress: ProgressService;
  comments: CommentService;
  profile: ProfileService;
  achievements: AchievementService;
  recommendations: RecommendationService;
  analytics: AnalyticsService;
  statsRollup: StatsRollupService;
  heroClips: HeroClipService;
  titleNames: TitleNamesService;
  curated: CuratedService;
  admin: AdminService;
  episodeInfo: EpisodeInfoService;
  insights: ProfileInsightsService;
  social: SocialService;
  collections: CollectionService;
  facts: FactsService;
  adminAnalytics: AdminAnalyticsService;
  /** The admin's own small connection pool (see below); closed on shutdown. */
  adminPrisma: PrismaClient;
  landing: LandingService;
  kodikSync: KodikCatalogSync;
  notifications: NotificationService;
  delivery: DeliveryService;
  schedule: ScheduleService;
  anilibriaSync: AnilibriaCatalogSync;
  seo: SeoRenderer;
}

/** Where uploaded avatars are written and served from (`/uploads/...`). */
export const UPLOADS_DIR = join(process.cwd(), "uploads");

export function createServices(deps: ContainerDeps): Services {
  const shikimori = new ShikimoriClient({
    baseUrl: deps.shikimori.baseUrl,
    userAgent: deps.shikimori.userAgent,
    isBackground,
  });
  const kodik = new KodikClient({
    token: deps.watch.kodikToken,
    baseUrl: deps.watch.kodikBase,
  });
  const alloha = new AllohaClient({ token: deps.watch.allohaToken });
  const anilibria = new AniLibriaClient();
  // One instance for anything a visitor is waiting on, and a second for
  // background passes. Each serialises its own requests to stay inside
  // AniList's rate limit — but sharing a single queue between the two meant a
  // warm pass of 60 titles put 45 seconds of backlog in front of every page
  // load that needed AniList. Separate lanes: background work can take as
  // long as it likes without anyone waiting on it.
  const anilist = new AniListClient();
  const anilistBackground = new AniListClient();
  // Same reasoning as AniList: one instance, so its own request queue is
  // actually shared rather than one queue per caller.

  const translator = deps.translate.enabled
    ? chainTranslators([
        new GoogleTranslator(),
        new MyMemoryTranslator({ email: deps.translate.email }),
      ])
    : identityTranslator;

  const translation = new TranslationService({
    prisma: deps.prisma,
    enabled: deps.translate.enabled,
    translator,
  });

  const episodeInfo = new EpisodeInfoService({
    prisma: deps.prisma,
    translator,
    translateEnabled: deps.translate.enabled,
    logger: deps.logger,
  });

  const catalog = new CatalogService({
    prisma: deps.prisma,
    shikimori,
    anilist,
    anilistBackground,
    cacheTtlSeconds: deps.cacheTtlSeconds,
    logger: deps.logger,
    translation,
    translator,
  });

  const achievements = new AchievementService({
    prisma: deps.prisma,
    proForAll: deps.proForAll,
  });

  const email = new EmailService({
    apiKey: deps.email.apiKey,
    from: deps.email.from,
    appUrl: deps.email.appUrl,
    logger: deps.logger,
  });
  const auth = new AuthService({
    prisma: deps.prisma,
    proForAll: deps.proForAll,
    uploadsDir: join(UPLOADS_DIR, "avatars"),
    telegramBotToken: deps.telegramBotToken,
    adminEmails: deps.adminEmails,
    email,
  });
  const library = new LibraryService({ prisma: deps.prisma, catalog });
  const progress = new ProgressService({ prisma: deps.prisma, catalog, achievements });
  const search = new SearchService({
    prisma: deps.prisma,
    shikimori,
    logger: deps.logger,
  });
  // The catalogue's search with filters runs on the search index's names.
  catalog.useTitleMatcher((q) => search.matchIds(q));
  const frames = new FrameService({
    prisma: deps.prisma,
    logger: deps.logger,
    apiKey: deps.traceMoeApiKey,
  });
  const watch = new WatchService({
    prisma: deps.prisma,
    kodik,
    alloha,
    anilibria,
    embedTemplate: deps.watch.embedTemplate,
    kodikDirectToken: deps.watch.kodikDirectToken,
    logger: deps.logger,
  });

  const comments = new CommentService({
    prisma: deps.prisma,
    proForAll: deps.proForAll,
    achievements,
  });
  const profile = new ProfileService({
    prisma: deps.prisma,
    achievements,
    uploadsRoot: UPLOADS_DIR,
    proForAll: deps.proForAll,
  });
  const insights = new ProfileInsightsService({
    prisma: deps.prisma,
    profile,
    achievements,
    catalog,
  });

  const recommendations = new RecommendationService({ prisma: deps.prisma });
  const analytics = new AnalyticsService({ prisma: deps.prisma, logger: deps.logger });
  const heroClips = new HeroClipService({
    prisma: deps.prisma,
    anilibria,
    logger: deps.logger,
    spotlightIds: async () => (await catalog.getDiscover()).spotlights.map((anime) => anime.id),
    resolveSources: (animeId) => watch.getSources(animeId),
    dir: env.HERO_CLIP_DIR ?? join(process.cwd(), "cache", "hero"),
    ffmpeg: env.FFMPEG_PATH,
  });
  // Clips are not cut any more (the hero shows frames); see server.ts.
  const statsRollup = new StatsRollupService({ prisma: deps.prisma, logger: deps.logger, rawDays: env.STATS_RAW_DAYS });
  // The admin's reports run on a pool of their own, four connections: a
  // heavy report then waits its turn there instead of taking the site's
  // connections from visitors.
  const adminPrisma = createPrismaClient({ poolMax: 4 });
  const admin = new AdminService({
    prisma: adminPrisma,
    logger: deps.logger,
    prometheusUrl: env.PROMETHEUS_URL,
  });
  // The DB-backed Prometheus gauges (accounts, active visitors…) read
  // through the admin service's queries.
  setGaugeSource(() => admin.gaugeSnapshot());

  const landing = new LandingService({ prisma: deps.prisma });
  const delivery = new DeliveryService(deps.prisma, deps.logger, {
    telegramToken: deps.telegramBotToken,
    telegramPolling: deps.telegramPolling ?? true,
    vapidPublicKey: deps.vapid?.publicKey,
    vapidPrivateKey: deps.vapid?.privateKey,
    vapidSubject: deps.vapid?.subject ?? "mailto:admin@animeshadow.online",
    appUrl: deps.email.appUrl.replace(/\/$/, ""),
  });
  const notifications = new NotificationService(
    deps.prisma,
    deps.logger,
    (items) => delivery.deliver(items),
    (grown) => delivery.deliverGuests(grown),
  );
  return {
    catalog,
    auth,
    library,
    watch,
    search,
    frames,
    progress,
    comments,
    profile,
    achievements,
    recommendations,
    analytics,
    statsRollup,
    curated: new CuratedService({ prisma: deps.prisma }),
    heroClips,
    titleNames: new TitleNamesService({ prisma: deps.prisma, shikimori, logger: deps.logger }),
    admin,
    episodeInfo,
    insights,
    social: new SocialService({ prisma: deps.prisma, insights }),
    collections: new CollectionService({ prisma: deps.prisma, proForAll: deps.proForAll }),
    facts: new FactsService({ prisma: deps.prisma }),
    adminAnalytics: new AdminAnalyticsService({ prisma: adminPrisma }),
    adminPrisma,
    landing,
    notifications,
    delivery,
    schedule: new ScheduleService(deps.prisma, anilist, deps.logger),
    kodikSync: new KodikCatalogSync({ prisma: deps.prisma, kodik, logger: deps.logger, notifications }),
    anilibriaSync: new AnilibriaCatalogSync({ prisma: deps.prisma, anilibria, catalog, logger: deps.logger }),
    seo: new SeoRenderer({ prisma: deps.prisma, landing }),
  };
}
