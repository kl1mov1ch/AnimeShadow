/**
 * "По желанию" — reading a free-text query as a mood/vibe and mapping it to
 * Shikimori genre names (Russian). Deliberately fuzzy: Russian and English
 * stems matched anywhere in the query.
 */
export interface MoodRule {
  test: RegExp;
  /** Shikimori genre names (as they appear in the API). */
  genres: string[];
}

export const MOOD_RULES: MoodRule[] = [
  { test: /грустн|печал|слёз|слез|плак|sad|cry|tearjerk|melanchol/i, genres: ["Драма"] },
  { test: /весёл|весел|смешн|смех|угар|юмор|funny|comed|hilarious|lol/i, genres: ["Комедия"] },
  { test: /экшен|экшн|драк|бо[ий]в|битв|сраж|action|fight|battle/i, genres: ["Экшен"] },
  { test: /роман|любов|влюб|romance|love|romcom/i, genres: ["Романтика"] },
  { test: /страшн|ужас|жутк|horror|scary|creepy/i, genres: ["Ужасы"] },
  { test: /детектив|расследов|тайн|загадк|detective|mystery|whodunit/i, genres: ["Детектив"] },
  { test: /космос|звёзд|звезд|галакт|space|cosmos|stars?/i, genres: ["Космос"] },
  { test: /робот|меха|пилот|mecha|gundam|giant robot/i, genres: ["Меха"] },
  { test: /школ|академ|ученик|school|classroom|academy/i, genres: ["Школа"] },
  { test: /спорт|футбол|волейбол|баскет|турнир|sport|tournament/i, genres: ["Спорт"] },
  { test: /маги|волшебн|фэнтези|фентези|чарод|fantasy|magic|wizard|sorcer/i, genres: ["Фэнтези", "Магия"] },
  { test: /фантастик|научн|киберпанк|будущ|sci-?fi|cyberpunk|future|dystop/i, genres: ["Фантастика"] },
  { test: /исекай|исэкай|попал в|другой мир|перенёсся|перенесся|isekai|another world/i, genres: ["Фэнтези", "Приключения"] },
  { test: /гарем|harem/i, genres: ["Гарем"] },
  { test: /самурай|катан|меченос|бусидо|samurai|katana|ronin/i, genres: ["Самураи", "Боевые искусства"] },
  { test: /войн|военн|солдат|фронт|military|war\b|soldier/i, genres: ["Военное"] },
  { test: /музык|группа|идол|конц[ае]рт|band|music|idol/i, genres: ["Музыка"] },
  { test: /психолог|разум|сознан|psycholog|mind games|mindfuck/i, genres: ["Психологическое"] },
  { test: /вампир|кров[ои]сос|vampire/i, genres: ["Вампиры"] },
  { test: /повседневн|уютн|тепл|расслаб|милот|cozy|chill|comfy|wholesome|slice of life/i, genres: ["Повседневность"] },
  { test: /супергеро|суперсил|сверхспособ|super ?power|superhero/i, genres: ["Супер сила"] },
  { test: /выживан|апокалипс|постапок|survival|apocalyps|zombie|зомби/i, genres: ["Ужасы", "Экшен"] },
  { test: /истори|прошл|средневеков|эпох|historical|medieval|edo period/i, genres: ["Исторический"] },
  { test: /триллер|напряж|thriller|suspense|tense/i, genres: ["Триллер"] },
  { test: /приключ|путешеств|adventure|journey|quest/i, genres: ["Приключения"] },
  { test: /сверхъестеств|призрак|дух|ёкай|йокай|supernatural|ghost|spirit|yokai/i, genres: ["Сверхъестественное"] },
  { test: /демон|бес|дьявол|demon|devil/i, genres: ["Демоны"] },
  { test: /игр|геймер|виртуал|game|gaming|vrmmo|mmo/i, genres: ["Игры"] },
];

export function detectMood(query: string): { genres: string[]; labels: string[] } {
  const genres = new Set<string>();
  for (const rule of MOOD_RULES) {
    if (rule.test.test(query)) {
      for (const g of rule.genres) genres.add(g);
    }
  }
  return { genres: [...genres], labels: [...genres] };
}
