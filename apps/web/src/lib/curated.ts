import type { CuratedCollection } from "@animeshadow/shared";
import {
  BrainIcon,
  CalendarIcon,
  CoffeeIcon,
  CompassIcon,
  FilmIcon,
  FlameIcon,
  GhostIcon,
  HeartIcon,
  type LucideIcon,
  MonitorPlayIcon,
  RadioIcon,
  RocketIcon,
  SmileIcon,
  TimerIcon,
  TrophyIcon,
} from "lucide-react";

export const CURATED_ICON: Record<CuratedCollection["icon"], LucideIcon> = {
  film: FilmIcon,
  timer: TimerIcon,
  calendar: CalendarIcon,
  compass: CompassIcon,
  radio: RadioIcon,
  trophy: TrophyIcon,
  coffee: CoffeeIcon,
  brain: BrainIcon,
  smile: SmileIcon,
  heart: HeartIcon,
  flame: FlameIcon,
  rocket: RocketIcon,
  ghost: GhostIcon,
  monitor: MonitorPlayIcon,
};

/** "217 тайтлов", "21 тайтл", "3 тайтла". */
export function titlesCount(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "тайтл" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "тайтла" : "тайтлов";
  return `${n.toLocaleString("ru-RU")} ${word}`;
}
