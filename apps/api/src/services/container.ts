import { AllohaClient } from "@animeshadow/alloha";
import { AniLibriaClient } from "@animeshadow/anilibria";
import { AniListClient } from "@animeshadow/anilist";
import { AnimeThemesClient } from "@animeshadow/animethemes";
import type { PrismaClient } from "@animeshadow/db";
import type { JikanClient } from "@animeshadow/jikan";
import { KodikClient } from "@animeshadow/kodik";
import { ShikimoriClient } from "@animeshadow/shikimori";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { AchievementService } from "./achievement.service.js";
import { AdminService } from "./admin.service.js";
import { AnalyticsService } from "./analytics.service.js";
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
import {
  chainTranslators,
  GoogleTranslator,
  identityTranslator,
  MyMemoryTranslator,
} from "./translator.js";
import { WatchService } from "./watch.service.js";

export interface ContainerDeps {
  prisma: PrismaClient;
  jikan: JikanClient;
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
  };
  telegramBotToken?: string | undefined;
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
  admin: AdminService;
}

/** Where uploaded avatars are written and served from (`/uploads/...`). */
export const UPLOADS_DIR = join(process.cwd(), "uploads");

export function createServices(deps: ContainerDeps): Services {
  const shikimori = new ShikimoriClient({
    baseUrl: deps.shikimori.baseUrl,
    userAgent: deps.shikimori.userAgent,
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
  const animethemes = new AnimeThemesClient();

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

  const catalog = new CatalogService({
    prisma: deps.prisma,
    shikimori,
    jikan: deps.jikan,
    anilist,
    anilistBackground,
    animethemes,
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
    uploadsDir: join(UPLOADS_DIR, "avatars"),
    proForAll: deps.proForAll,
  });

  const recommendations = new RecommendationService({ prisma: deps.prisma });
  const analytics = new AnalyticsService({ prisma: deps.prisma });
  const admin = new AdminService({ prisma: deps.prisma });

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
    admin,
  };
}
