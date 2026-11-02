import type { TitleIcon } from "@animeshadow/shared";

export interface WatchRank {
  rank: number;
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  seconds: number;
  titles: number;
  avatarFrame?: string | null;
  isPro?: boolean;
  weeklyWatchPlace?: number | null;
  monthlyWatchPlace?: number | null;
  profileTitle?: string | null;
  titlePrefix?: string | null;
  titleIcon?: TitleIcon | null;
  episodes?: number | null;
  xp?: number | null;
}
export interface WatchBoard {
  top: WatchRank[];
  me: WatchRank | null;
  week: { startsAt: string; endsAt: string; proDays: number[] };
}

export function watchTimeParts(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600),
    minutes = Math.floor((safe % 3600) / 60);
  return hours > 0
    ? { value: hours, unit: "ч", detail: minutes ? `${minutes} мин` : "" }
    : minutes > 0
      ? { value: minutes, unit: "мин", detail: safe % 60 ? `${safe % 60} с` : "" }
      : { value: safe, unit: "с", detail: "" };
}
export function watchTimeLabel(seconds: number) {
  const time = watchTimeParts(seconds);
  return `${time.value.toLocaleString("ru-RU")} ${time.unit}${time.detail ? ` ${time.detail}` : ""}`;
}
