import { AllohaClient } from "@animeshadow/alloha";
import { AniLibriaClient } from "@animeshadow/anilibria";
import type { PrismaClient } from "@animeshadow/db";
import type { JikanClient } from "@animeshadow/jikan";
import { KodikClient } from "@animeshadow/kodik";
import { ShikimoriClient } from "@animeshadow/shikimori";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { AchievementService } from "./achievement.service.js";
import { AuthService } from "./auth.service.js";
import { CatalogService } from "./catalog.service.js";
import { CommentService } from "./comment.service.js";
import { LibraryService } from "./library.service.js";
import { ProfileService } from "./profile.service.js";
import { ProgressService } from "./progress.service.js";
import { RecommendationService } from "./recommendation.service.js";
import { ReviewService } from "./review.service.js";
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
}

export interface Services {
  catalog: CatalogService;
  auth: AuthService;
  library: LibraryService;
  reviews: ReviewService;
  watch: WatchService;
  search: SearchService;
  progress: ProgressService;
  comments: CommentService;
  profile: ProfileService;
  achievements: AchievementService;
  recommendations: RecommendationService;
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
    cacheTtlSeconds: deps.cacheTtlSeconds,
    logger: deps.logger,
    translation,
    translator,
  });

  const achievements = new AchievementService({
    prisma: deps.prisma,
    proForAll: deps.proForAll,
  });

  const auth = new AuthService({
    prisma: deps.prisma,
    proForAll: deps.proForAll,
    uploadsDir: join(UPLOADS_DIR, "avatars"),
    telegramBotToken: deps.telegramBotToken,
  });
  const library = new LibraryService({ prisma: deps.prisma, catalog });
  const reviews = new ReviewService({ prisma: deps.prisma, catalog, achievements });
  const progress = new ProgressService({ prisma: deps.prisma, catalog, achievements });
  const search = new SearchService({
    prisma: deps.prisma,
    shikimori,
    logger: deps.logger,
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

  return {
    catalog,
    auth,
    library,
    reviews,
    watch,
    search,
    progress,
    comments,
    profile,
    achievements,
    recommendations,
  };
}
