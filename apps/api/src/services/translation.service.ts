import type { PrismaClient } from "@animeshadow/db";
import type { AnimeDetail, Locale } from "@animeshadow/shared";
import type { Translator } from "./translator.js";

export interface TranslationServiceDeps {
  prisma: PrismaClient;
  translator: Translator;
  enabled: boolean;
}

/**
 * The catalogue is Russian-native (Shikimori). This only kicks in for English
 * viewers: it machine-translates the Russian synopsis/background to English and
 * caches the result in `AnimeTranslation` forever. Failures fall back to the
 * original Russian text.
 */
export class TranslationService {
  private readonly prisma: PrismaClient;
  private readonly translator: Translator;
  private readonly enabled: boolean;

  constructor(deps: TranslationServiceDeps) {
    this.prisma = deps.prisma;
    this.translator = deps.translator;
    this.enabled = deps.enabled;
  }

  async localizeDetail(detail: AnimeDetail, lang: Locale): Promise<AnimeDetail> {
    // Russian is the source language — nothing to do.
    if (lang === "ru") return { ...detail, translated: true };
    if (!this.enabled) return detail;

    const cached = await this.prisma.animeTranslation.findMany({
      where: { animeId: detail.id, lang: "en" },
    });
    const store = new Map(cached.map((row) => [row.field, row.value]));

    await this.fill(detail.id, "synopsis", detail.synopsis, store);
    await this.fill(detail.id, "background", detail.background, store);

    const synopsis = store.get("synopsis") ?? detail.synopsis;
    return {
      ...detail,
      // English title is already the canonical `title`; drop the RU localised one.
      titleLocalized: null,
      synopsis,
      background: store.get("background") ?? detail.background,
      translated: store.has("synopsis"),
    };
  }

  private async fill(
    animeId: number,
    field: "synopsis" | "background",
    source: string | null,
    store: Map<string, string>,
  ): Promise<void> {
    if (!source || store.has(field)) return;
    const translated = await this.translator.translate(source, "ru", "en");
    if (!translated || translated.trim() === source.trim()) return;
    store.set(field, translated);
    await this.prisma.animeTranslation
      .upsert({
        where: { animeId_lang_field: { animeId, lang: "en", field } },
        create: { animeId, lang: "en", field, value: translated },
        update: { value: translated },
      })
      .catch(() => undefined);
  }
}
