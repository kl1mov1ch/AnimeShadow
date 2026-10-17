import type { PrismaClient } from "@animeshadow/db";
import { contentGuardWhere } from "../lib/content-guard.js";

export type FactKind = "history" | "record" | "drama" | "trivia";

export interface AnimeFact {
  id: string;
  kind: FactKind;
  /** When it happened, for the card's corner. */
  year: number | null;
  /** A short headline. */
  title: string;
  text: string;
  anime: { id: number; slug: string; title: string; image: string | null } | null;
}

export interface FactsServiceDeps {
  prisma: PrismaClient;
}

/** A fact as written: the anime is named by its MyAnimeList id (our id). */
interface Written {
  id: string;
  kind: FactKind;
  year: number | null;
  title: string;
  text: string;
  animeId: number | null;
}

/**
 * "Did you know" — written by hand: how famous anime came to be, the
 * records they set and the turns their stories took off screen. Each one is
 * a well-documented, widely reported fact, not a number read off the
 * catalogue; the title it is about is linked when it is in the catalogue.
 */
const FACTS: Written[] = [
  {
    id: "astro-budget",
    kind: "history",
    year: 1963,
    title: "Как Тэдзука удешевил анимацию",
    text: "«Астробой» Осаму Тэдзуки снимали за копейки, поэтому студия повторно использовала одни и те же кадры и двигала на экране только рот и глаза. Этот приём «ограниченной анимации» стал стандартом японского ТВ-аниме на десятилетия вперёд.",
    animeId: 2747,
  },
  {
    id: "astro-us",
    kind: "history",
    year: 1963,
    title: "Первое аниме на американском ТВ",
    text: "В том же 1963 году «Астробоя» дублировали и показали в США — это был первый японский анимационный сериал на американском телевидении.",
    animeId: 2747,
  },
  {
    id: "sazae",
    kind: "record",
    year: 1969,
    title: "Сериал длиной в полвека",
    text: "«Садзаэ-сан» выходит каждое воскресенье с 1969 года. Книга рекордов Гиннесса признала его самым долгим анимационным сериалом в истории телевидения — серий в нём уже больше семи тысяч.",
    animeId: 2406,
  },
  {
    id: "akira-cels",
    kind: "record",
    year: 1988,
    title: "327 цветов «Акиры»",
    text: "Для «Акиры» нарисовали больше 160 тысяч кадров и использовали 327 оттенков краски — 50 из них создали специально для фильма, чтобы ночной Нео-Токио светился так, как задумал Кацухиро Отомо.",
    animeId: 47,
  },
  {
    id: "fireflies-totoro",
    kind: "drama",
    year: 1988,
    title: "Самый странный двойной сеанс",
    text: "«Могилу светлячков» и «Моего соседа Тоторо» выпустили в кино одним сеансом: трагедия о войне и добрая сказка шли друг за другом. Зрители выходили из зала в слезах после первой половины — и смеялись на второй.",
    animeId: 578,
  },
  {
    id: "totoro-logo",
    kind: "trivia",
    year: 1988,
    title: "Тоторо стал логотипом",
    text: "Тоторо оказался настолько любимым, что его силуэт стал логотипом студии Ghibli — его видно в начале каждого их фильма.",
    animeId: 523,
  },
  {
    id: "porygon",
    kind: "drama",
    year: 1997,
    title: "Серия, после которой изменилось ТВ",
    text: "После серии «Покемона» с мигающими красно-синими вспышками сотни детей в Японии почувствовали себя плохо, многих увезли в больницу. Сериал сняли с эфира на четыре месяца, а японское телевидение ввело правила против резких вспышек, которые действуют до сих пор.",
    animeId: 527,
  },
  {
    id: "eva-ending",
    kind: "drama",
    year: 1996,
    title: "Финал, который пришлось переснять",
    text: "Последние серии «Евангелиона» делали, когда у студии кончались время и деньги: вместо битв — монологи, наброски и текст на экране. Зрители были в ярости, и через год вышел фильм «Конец Евангелиона» с совсем другой развязкой.",
    animeId: 30,
  },
  {
    id: "bebop-tv",
    kind: "history",
    year: 1998,
    title: "«Ковбой Бибоп» показали не целиком",
    text: "Первый показ «Ковбоя Бибопа» на TV Tokyo урезали до двенадцати серий и спецвыпуска — остальные сочли слишком жестокими для эфира. Целиком сериал вышел позже, на спутниковом канале WOWOW.",
    animeId: 1,
  },
  {
    id: "mononoke-cels",
    kind: "history",
    year: 1997,
    title: "Миядзаки проверил каждый кадр",
    text: "Для «Принцессы Мононоке» нарисовали около 144 тысяч кадров. Хаяо Миядзаки лично просматривал их и перерисовал части десятков тысяч из них.",
    animeId: 164,
  },
  {
    id: "spirited-oscar",
    kind: "record",
    year: 2003,
    title: "Единственный «Оскар» аниме",
    text: "«Унесённые призраками» получили «Оскар» за лучший анимационный фильм — первый и пока единственный японский рисованный фильм с этой наградой. Миядзаки на церемонию не приехал в знак протеста против войны в Ираке.",
    animeId: 199,
  },
  {
    id: "spirited-box",
    kind: "record",
    year: 2001,
    title: "Девятнадцать лет на вершине",
    text: "«Унесённые призраками» почти двадцать лет оставались самым кассовым фильмом в истории японского проката — пока в 2020 году их не обогнал «Клинок, рассекающий демонов: Бесконечный поезд».",
    animeId: 199,
  },
  {
    id: "gits-matrix",
    kind: "history",
    year: 1995,
    title: "Аниме, которое показали продюсерам «Матрицы»",
    text: "Сёстры Вачовски рассказывали, что, уговаривая продюсеров снять «Матрицу», показывали им «Призрака в доспехах» — со словами «мы хотим сделать это вживую». Зелёные символы на экранах — оттуда же.",
    animeId: 43,
  },
  {
    id: "fma-two",
    kind: "history",
    year: 2009,
    title: "Почему «Стальной алхимик» есть дважды",
    text: "Аниме 2003 года догнало ещё не законченную мангу и придумало собственный финал. Когда манга завершилась, в 2009 году сняли «Братство» — уже точно по сюжету Хирому Аракавы.",
    animeId: 5114,
  },
  {
    id: "onepiece-plan",
    kind: "trivia",
    year: 1997,
    title: "«Ван-Пис» задумывали на пять лет",
    text: "Эйитиро Ода рассказывал, что поначалу рассчитывал закончить «Ван-Пис» лет за пять. Манга выходит с 1997 года, аниме — с 1999-го, и история всё ещё не завершена.",
    animeId: 21,
  },
  {
    id: "dragonball-journey",
    kind: "history",
    year: 1986,
    title: "Сон Гоку пришёл из старинного романа",
    text: "Акира Торияма построил начало «Драконьего жемчуга» на китайском романе XVI века «Путешествие на Запад»: Гоку — это Сунь Укун, Царь обезьян, с его посохом и облаком.",
    animeId: 223,
  },
  {
    id: "berserk-miura",
    kind: "drama",
    year: 2021,
    title: "История, которую закончил друг",
    text: "Кэнтаро Миура, автор «Берсерка», умер в 2021 году, не закончив мангу, которую рисовал больше тридцати лет. Её продолжил его близкий друг, мангака Кодзи Мори, вместе с ассистентами Миуры — по планам, которыми тот успел поделиться.",
    animeId: 33,
  },
  {
    id: "kyoani",
    kind: "drama",
    year: 2019,
    title: "Трагедия Kyoto Animation",
    text: "В июле 2019 года поджог студии Kyoto Animation унёс жизни 36 человек. Студия выстояла: в 2020 году вышел фильм «Вайолет Эвергарден», в титрах которого названы и погибшие.",
    animeId: 33352,
  },
  {
    id: "yourname",
    kind: "record",
    year: 2016,
    title: "«Твоё имя» обошло всех",
    text: "Фильм Макото Синкая «Твоё имя» несколько лет был самым кассовым аниме-фильмом в мире. До него Синкай делал небольшие картины почти в одиночку — первую, «Голос далёкой звезды», он нарисовал на домашнем компьютере.",
    animeId: 32281,
  },
  {
    id: "demon-slayer",
    kind: "record",
    year: 2020,
    title: "Поезд, который побил рекорд",
    text: "«Клинок, рассекающий демонов: Бесконечный поезд» вышел в 2020 году, в разгар пандемии, и всё равно стал самым кассовым фильмом в истории Японии.",
    animeId: 38000,
  },
  {
    id: "hxh-hiatus",
    kind: "drama",
    year: 2011,
    title: "Перерывы длиной в годы",
    text: "Ёсихиро Тогаси, автор «Охотника × Охотника», из-за сильных болей в спине годами не мог рисовать — перерывы между главами доходили до нескольких лет. Сериал 2011 года успел пройти почти весь вышедший к тому моменту сюжет.",
    animeId: 11061,
  },
  {
    id: "sailor-togashi",
    kind: "trivia",
    year: 1999,
    title: "Семья двух мангак",
    text: "Наоко Такэути, создательница «Сейлор Мун», в 1999 году вышла замуж за Ёсихиро Тогаси — автора «Охотника × Охотника» и «Ю-Ю Хакусё».",
    animeId: 530,
  },
  {
    id: "jojo-bands",
    kind: "trivia",
    year: 1987,
    title: "Персонажи с именами рок-групп",
    text: "Хирохико Араки называет героев «Невероятных приключений ДжоДжо» в честь западной музыки: Спидвагон, Цеппели, Киллер Квин — фанаты собирают целые плейлисты по именам персонажей.",
    animeId: 14719,
  },
  {
    id: "madoka",
    kind: "history",
    year: 2011,
    title: "Милая обложка — нарочно",
    text: "Для «Девочки-волшебницы Мадоки Магики» пригласили художницу уютной комедии Умэ Аоки, а сценарий написал Гэн Уробути, известный мрачными историями. Контраст был задуман: зрители до третьей серии не ждали поворота.",
    animeId: 9756,
  },
  {
    id: "steins-titor",
    kind: "trivia",
    year: 2011,
    title: "Компьютер из интернет-легенды",
    text: "Сюжет «Врат Штейна» опирается на реальную сетевую легенду: в 2000 году человек под ником Джон Титор писал на форумах, что прибыл из будущего за старым компьютером IBM 5100 — тем самым, что ищут герои.",
    animeId: 9253,
  },
  {
    id: "aot-idea",
    kind: "history",
    year: 2009,
    title: "Откуда взялись титаны",
    text: "Хадзимэ Исаяма рассказывал, что идея «Атаки титанов» родилась после ночной смены в интернет-кафе, где его схватил пьяный посетитель: он понял, как страшно столкнуться с человеком, с которым невозможно договориться.",
    animeId: 16498,
  },
  {
    id: "deathnote-light",
    kind: "trivia",
    year: 2006,
    title: "Луна вместо имени",
    text: "Имя главного героя «Тетради смерти» пишется иероглифом «луна» (月), но читается «Лайт» — свет. Сам Лайт говорит, что такое имя ему дали родители.",
    animeId: 1535,
  },
  {
    id: "gintama-parody",
    kind: "trivia",
    year: 2006,
    title: "Сериал, который извинялся за шутки",
    text: "«Гинтама» так часто пародировала другие аниме и рекламу, что в эфире иногда закрывала шутки цензурой и смайликами — и сами эти заплатки стали частью юмора.",
    animeId: 918,
  },
];

/** Everything about the facts is fixed text; only the posters come from the catalogue. */
export class FactsService {
  private readonly prisma: PrismaClient;
  private cache: AnimeFact[] | null = null;

  constructor(deps: FactsServiceDeps) {
    this.prisma = deps.prisma;
  }

  async random(count: number): Promise<{ facts: AnimeFact[]; total: number }> {
    const all = await this.load();
    const picks = new Set<number>();
    const want = Math.min(count, all.length);
    while (picks.size < want) picks.add(Math.floor(Math.random() * all.length));
    return { facts: [...picks].map((i) => all[i]!), total: all.length };
  }

  private async load(): Promise<AnimeFact[]> {
    if (this.cache) return this.cache;
    const ids = [...new Set(FACTS.flatMap((f) => (f.animeId != null ? [f.animeId] : [])))];
    const rows = await this.prisma.anime.findMany({
      where: { AND: [{ id: { in: ids } }, contentGuardWhere(false)] },
      select: { id: true, slug: true, title: true, titleLocalized: true, imageUrl: true, imageLargeUrl: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    this.cache = FACTS.filter((fact) => fact.animeId == null || byId.has(fact.animeId)).map(({ animeId, ...fact }) => {
      const a = animeId != null ? byId.get(animeId) : undefined;
      return {
        ...fact,
        anime: a ? { id: a.id, slug: a.slug, title: a.titleLocalized ?? a.title, image: a.imageLargeUrl ?? a.imageUrl } : null,
      };
    });
    return this.cache;
  }
}
