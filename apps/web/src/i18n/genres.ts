/** English genre name → Russian. Unknown names pass through. */
export const GENRE_RU: Record<string, string> = {
  Action: "Экшен",
  Adventure: "Приключения",
  "Avant Garde": "Авангард",
  "Award Winning": "Отмеченное наградами",
  "Boys Love": "Сёнэн-ай",
  Comedy: "Комедия",
  Drama: "Драма",
  Fantasy: "Фэнтези",
  "Girls Love": "Сёдзё-ай",
  Gourmet: "Гурман",
  Horror: "Ужасы",
  Mystery: "Мистика",
  Romance: "Романтика",
  "Sci-Fi": "Фантастика",
  "Slice of Life": "Повседневность",
  Sports: "Спорт",
  Supernatural: "Сверхъестественное",
  Suspense: "Напряжение",
  Ecchi: "Этти",
  Erotica: "Эротика",
  Hentai: "Хентай",
  "Adult Cast": "Взрослые персонажи",
  Anthropomorphic: "Антропоморфизм",
  CGDCT: "Милые девочки",
  Childcare: "Забота о детях",
  "Combat Sports": "Единоборства",
  Crossdressing: "Переодевание",
  Delinquents: "Хулиганы",
  Detective: "Детектив",
  Educational: "Образовательное",
  "Gag Humor": "Абсурдный юмор",
  Gore: "Жестокость",
  Harem: "Гарем",
  "High Stakes Game": "Игра на выживание",
  "Historical": "История",
  "Idols (Female)": "Идолы (девушки)",
  "Idols (Male)": "Идолы (парни)",
  Isekai: "Исекай",
  Iyashikei: "Иясикэй",
  "Love Polygon": "Любовный многоугольник",
  "Magical Sex Shift": "Смена пола",
  "Mahou Shoujo": "Махо-сёдзё",
  "Martial Arts": "Боевые искусства",
  Mecha: "Меха",
  Medical: "Медицина",
  Military: "Военное",
  Music: "Музыка",
  Mythology: "Мифология",
  "Organized Crime": "Организованная преступность",
  "Otaku Culture": "Культура отаку",
  Parody: "Пародия",
  "Performing Arts": "Сценическое искусство",
  Pets: "Питомцы",
  Psychological: "Психология",
  Racing: "Гонки",
  Reincarnation: "Перерождение",
  "Reverse Harem": "Обратный гарем",
  "Romantic Subtext": "Романтический подтекст",
  Samurai: "Самураи",
  School: "Школа",
  Showbiz: "Шоу-бизнес",
  Space: "Космос",
  "Strategy Game": "Стратегические игры",
  "Super Power": "Супер-сила",
  Survival: "Выживание",
  "Team Sports": "Командный спорт",
  "Time Travel": "Путешествия во времени",
  Vampire: "Вампиры",
  "Video Game": "Видеоигры",
  "Visual Arts": "Изобразительное искусство",
  Workplace: "Работа",
  Josei: "Дзёсэй",
  Kids: "Детское",
  Seinen: "Сэйнэн",
  Shoujo: "Сёдзё",
  Shounen: "Сёнэн",
  // Classic MAL/Shikimori genres the newer list above doesn't cover.
  Dementia: "Безумие",
  Demons: "Демоны",
  Doujinshi: "Додзинси",
  Game: "Игры",
  Magic: "Магия",
  Cars: "Машины",
  Police: "Полиция",
  Thriller: "Триллер",
  "Shounen Ai": "Сёнэн-ай",
  "Shoujo Ai": "Сёдзё-ай",
  Yaoi: "Яой",
  Yuri: "Юри",
};

/**
 * Alternate Russian spellings Shikimori uses for genres we already know under
 * a different wording. Maps the incoming name to its canonical English key.
 */
const RU_ALIASES: Record<string, string> = {
  Исторический: "Historical",
  "Научная фантастика": "Sci-Fi",
  "Повседневная жизнь": "Slice of Life",
  Единоборства: "Martial Arts",
  Фантастика: "Sci-Fi",
  Спортивное: "Sports",
  Психологическое: "Psychological",
  Романтика: "Romance",
  Магический: "Magic",
};

/**
 * Catalogue genres arrive already localised to Russian (Shikimori returns
 * `russian || name`), so translating *into* English needs the reverse map.
 * Keys are normalised because upstream spelling drifts from ours
 * ("Супер сила" vs "Супер-сила", "Сёнен" vs "Сёнэн").
 */
function normalizeGenre(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s\-–—_]/g, "")
    // Fold the vowels upstream spells inconsistently: "Сёнэн" / "Сёнен" /
    // "Сенэн" must all collapse to one key, likewise "Дзёсэй" / "Дзёсей".
    .replace(/[ёэ]/g, "е")
    .replace(/й/g, "и");
}

const EN_BY_NORM: Record<string, string> = {};
const RU_BY_NORM: Record<string, string> = {};
for (const [en, ru] of Object.entries(GENRE_RU)) {
  EN_BY_NORM[normalizeGenre(ru)] = en;
  EN_BY_NORM[normalizeGenre(en)] = en;
  RU_BY_NORM[normalizeGenre(en)] = ru;
  RU_BY_NORM[normalizeGenre(ru)] = ru;
}
// Alternate upstream spellings resolve to the canonical pair.
for (const [ru, en] of Object.entries(RU_ALIASES)) {
  EN_BY_NORM[normalizeGenre(ru)] = en;
  RU_BY_NORM[normalizeGenre(ru)] = GENRE_RU[en] ?? ru;
}

/** Translate a genre name (in either language) into `locale`. Unknown names pass through. */
export function localizeGenre(name: string, locale: string): string {
  const key = normalizeGenre(name);
  return (locale === "ru" ? RU_BY_NORM[key] : EN_BY_NORM[key]) ?? name;
}
