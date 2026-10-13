/**
 * Secret achievements: how to earn each, kept here on the server and never
 * sent to anyone but an admin. A visitor sees only that one exists.
 * Each one: watch at least `episodes` episodes of the title `animeId`.
 */
export interface SecretRule {
  id: string;
  animeId: number;
  episodes: number;
  /** For the admin panel. */
  condition: string;
}

export const SECRET_RULES: readonly SecretRule[] = [
  { id: "secret-ghoul", animeId: 22319, episodes: 12, condition: "Досмотреть «Токийский гуль» (12 серий)" },
  { id: "secret-shinigami", animeId: 1535, episodes: 37, condition: "Досмотреть «Тетрадь смерти» (37 серий)" },
  { id: "secret-scout", animeId: 16498, episodes: 25, condition: "Досмотреть первый сезон «Атаки титанов» (25 серий)" },
  { id: "secret-hokage", animeId: 20, episodes: 100, condition: "Посмотреть 100 серий «Наруто»" },
  { id: "secret-pirate", animeId: 21, episodes: 100, condition: "Посмотреть 100 серий «Ван-Писа»" },
  { id: "secret-alchemist", animeId: 5114, episodes: 64, condition: "Досмотреть «Стальной алхимик: Братство» (64 серии)" },
  { id: "secret-scientist", animeId: 9253, episodes: 24, condition: "Досмотреть «Врата Штейна» (24 серии)" },
  { id: "secret-hero", animeId: 30276, episodes: 12, condition: "Досмотреть первый сезон «Ванпанчмена» (12 серий)" },
  { id: "secret-slayer", animeId: 38000, episodes: 26, condition: "Досмотреть первый сезон «Клинка, рассекающего демонов» (26 серий)" },
  { id: "secret-sorcerer", animeId: 40748, episodes: 24, condition: "Досмотреть первый сезон «Магической битвы» (24 серии)" },
  { id: "secret-devil", animeId: 44511, episodes: 12, condition: "Досмотреть «Человек-бензопилу» (12 серий)" },
  { id: "secret-pilot", animeId: 30, episodes: 26, condition: "Досмотреть «Евангелион нового поколения» (26 серий)" },
  { id: "secret-hunter", animeId: 11061, episodes: 50, condition: "Посмотреть 50 серий «Охотник х Охотник (2011)»" },
  { id: "secret-spirit", animeId: 199, episodes: 1, condition: "Посмотреть «Унесённые призраками»" },
];
