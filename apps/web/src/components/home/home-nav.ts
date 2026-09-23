/** The five links from the mock, in that order, pointing at real routes. */
export const HOME_NAV = [
  { to: "/", label: "Главная", end: true },
  { to: "/browse", label: "Каталог", end: false },
  { to: "/browse?orderBy=start_date&sort=desc", label: "Новинки", end: false },
  { to: "/browse?orderBy=members&sort=desc", label: "Популярное", end: false },
  { to: "/support", label: "Подписка", end: false },
];
