import {
  BotIcon,
  CompassIcon,
  DramaIcon,
  EyeIcon,
  GhostIcon,
  HeartIcon,
  type LucideIcon,
  RocketIcon,
  SchoolIcon,
  SearchIcon,
  SmileIcon,
  SwordsIcon,
  TrophyIcon,
  WandSparklesIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

/**
 * A line drawn in the page's own ink, so every weave below reads on a light
 * background and on a dark one without a second definition.
 */
const ink = (percent: number) =>
  `color-mix(in srgb, var(--foreground) ${percent}%, transparent)`;

/**
 * The weaves. Pure CSS gradients rather than images: nothing to download,
 * nothing to cache, and they stay crisp at any tile size.
 *
 * Since every tile now wears the site colour, the weave is what tells the
 * genres apart — so each one gets its own, and no two are alike.
 */
const PATTERN: Record<string, CSSProperties> = {
  rays: {
    backgroundImage: `repeating-linear-gradient(115deg, ${ink(14)} 0 2px, transparent 2px 16px)`,
  },
  waves: {
    backgroundImage: `repeating-radial-gradient(circle at 50% 100%, transparent 0 13px, ${ink(13)} 13px 14px)`,
    backgroundSize: "36px 18px",
  },
  dots: {
    backgroundImage: `radial-gradient(${ink(16)} 1.6px, transparent 1.7px)`,
    backgroundSize: "14px 14px",
  },
  twill: {
    backgroundImage: `repeating-linear-gradient(45deg, ${ink(10)} 0 1px, transparent 1px 8px), repeating-linear-gradient(-45deg, ${ink(6)} 0 1px, transparent 1px 8px)`,
  },
  rain: {
    backgroundImage: `repeating-linear-gradient(100deg, ${ink(12)} 0 1px, transparent 1px 11px)`,
  },
  asanoha: {
    backgroundImage: `repeating-linear-gradient(60deg, ${ink(10)} 0 1px, transparent 1px 20px), repeating-linear-gradient(-60deg, ${ink(10)} 0 1px, transparent 1px 20px), repeating-linear-gradient(0deg, ${ink(8)} 0 1px, transparent 1px 20px)`,
  },
  grid: {
    backgroundImage: `repeating-linear-gradient(0deg, ${ink(11)} 0 1px, transparent 1px 16px), repeating-linear-gradient(90deg, ${ink(11)} 0 1px, transparent 1px 16px)`,
  },
  petals: {
    backgroundImage: `radial-gradient(ellipse 7px 12px at 25% 25%, ${ink(15)} 0 60%, transparent 62%), radial-gradient(ellipse 12px 7px at 75% 70%, ${ink(11)} 0 60%, transparent 62%)`,
    backgroundSize: "48px 48px",
  },
  rule: {
    backgroundImage: `repeating-linear-gradient(0deg, ${ink(12)} 0 1px, transparent 1px 14px)`,
  },
  hex: {
    backgroundImage: `repeating-linear-gradient(30deg, ${ink(9)} 0 1px, transparent 1px 22px), repeating-linear-gradient(150deg, ${ink(9)} 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, ${ink(7)} 0 1px, transparent 1px 22px)`,
  },
  chevrons: {
    backgroundImage: `repeating-linear-gradient(135deg, ${ink(13)} 0 3px, transparent 3px 14px)`,
  },
  rings: {
    backgroundImage: `repeating-radial-gradient(circle at 85% 15%, transparent 0 11px, ${ink(11)} 11px 12px)`,
  },
  stripes: {
    backgroundImage: `repeating-linear-gradient(90deg, ${ink(12)} 0 2px, transparent 2px 15px)`,
  },
};

export interface GenreArt {
  icon: LucideIcon;
  pattern: keyof typeof PATTERN;
  /** Where the wash comes from, in degrees — the one thing that varies. */
  angle: number;
  /** How strongly the site colour sits on this tile, 0-100. */
  weight: number;
}

/**
 * The genres the front page leads with, and what each one looks like.
 *
 * This is an allow-list, not a block-list: only the everyday shelves are
 * here, so the adult and fan-service genres never reach the homepage no
 * matter how large they grow. Keyed by catalogue id — the names in the
 * database are Russian, so matching on an English word matched nothing.
 *
 * Every tile is the site colour and nothing else: no anime still (a poster
 * promises one particular title, and the card leads to hundreds) and no
 * borrowed palette of its own. What separates them is the weave, the mark,
 * and how much of the colour each one carries.
 */
export const GENRE_ART: Record<number, GenreArt> = {
  1: { icon: SwordsIcon, pattern: "rays", angle: 115, weight: 34 }, // Экшен
  2: { icon: CompassIcon, pattern: "waves", angle: 160, weight: 24 }, // Приключения
  4: { icon: SmileIcon, pattern: "dots", angle: 135, weight: 30 }, // Комедия
  7: { icon: SearchIcon, pattern: "twill", angle: 200, weight: 20 }, // Детектив
  8: { icon: DramaIcon, pattern: "rain", angle: 100, weight: 26 }, // Драма
  10: { icon: WandSparklesIcon, pattern: "asanoha", angle: 145, weight: 32 }, // Фэнтези
  18: { icon: BotIcon, pattern: "grid", angle: 180, weight: 22 }, // Меха
  22: { icon: HeartIcon, pattern: "petals", angle: 125, weight: 36 }, // Романтика
  23: { icon: SchoolIcon, pattern: "rule", angle: 170, weight: 22 }, // Школа
  24: { icon: RocketIcon, pattern: "hex", angle: 150, weight: 28 }, // Фантастика
  30: { icon: TrophyIcon, pattern: "chevrons", angle: 130, weight: 26 }, // Спорт
  37: { icon: GhostIcon, pattern: "rings", angle: 190, weight: 30 }, // Сверхъестественное
  41: { icon: EyeIcon, pattern: "stripes", angle: 210, weight: 24 }, // Триллер
};

/** The ids the homepage is allowed to show, in no particular order. */
export const HOME_GENRE_IDS = new Set(Object.keys(GENRE_ART).map(Number));

/** Every mark in the allow-list, for the "all genres" tile to wear. */
export const GENRE_ICONS = Object.values(GENRE_ART).map((art) => art.icon);

/**
 * The wash: the site colour, leaning in from one corner and gone before the
 * text starts. Only the angle and the strength change between tiles, so the
 * row reads as one family rather than thirteen unrelated swatches.
 */
export function tintStyle(art: GenreArt): CSSProperties {
  const strong = `color-mix(in srgb, var(--primary) ${art.weight}%, transparent)`;
  const faint = `color-mix(in srgb, var(--primary) ${Math.round(art.weight / 3)}%, transparent)`;
  return {
    background: `linear-gradient(${art.angle}deg, ${strong} 0%, ${faint} 55%, transparent 100%)`,
  };
}

/** The weave over the wash. */
export function patternStyle(art: GenreArt): CSSProperties {
  return PATTERN[art.pattern] ?? {};
}
