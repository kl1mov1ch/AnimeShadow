import { BellIcon, BookmarkIcon, CalendarDaysIcon, FlameIcon, HeartIcon, HouseIcon, LayersIcon, LayoutGridIcon, Settings2Icon, SparklesIcon, TrophyIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import type { MobileNavigationItem } from "@animeshadow/shared";

export const NAVIGATION_ITEMS = {
  home: { label: "Главная", short: "Главная", icon: HouseIcon, to: "/", private: false },
  catalog: { label: "Каталог", short: "Каталог", icon: LayoutGridIcon, to: "/browse", private: false },
  rooms: { label: "Комнаты", short: "Комнаты", icon: UsersIcon, to: "/party", private: false },
  profile: { label: "Профиль", short: "Профиль", icon: UserRoundIcon, to: "/profile", private: true },
  library: { label: "Мой список", short: "Список", icon: BookmarkIcon, to: "/library", private: true },
  notifications: { label: "Уведомления", short: "Серии", icon: BellIcon, to: "/library#new-episodes", private: true },
  schedule: { label: "Расписание", short: "График", icon: CalendarDaysIcon, to: "/schedule", private: false },
  collections: { label: "Подборки", short: "Подборки", icon: LayersIcon, to: "/collections", private: false },
  ongoing: { label: "Онгоинги", short: "Онгоинги", icon: FlameIcon, to: "/ongoing", private: false },
  top: { label: "Топ аниме", short: "Топ", icon: TrophyIcon, to: "/top", private: false },
  settings: { label: "Настройки меню", short: "Меню", icon: Settings2Icon, to: "/profile?studio=navigation", private: true },
  recommendations: { label: "Рекомендации", short: "Для тебя", icon: SparklesIcon, to: "/recommendations", private: true },
  support: { label: "Поддержать проект", short: "Донат", icon: HeartIcon, to: "/support", private: false },
} satisfies Record<MobileNavigationItem, { label: string; short: string; icon: typeof HouseIcon; to: string; private: boolean }>;

export function navigationActive(pathname: string, items: MobileNavigationItem[]): MobileNavigationItem | null {
  return items.find((id) => {
    if (id === "notifications" || id === "settings") return false;
    const path = NAVIGATION_ITEMS[id].to;
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  }) ?? null;
}
