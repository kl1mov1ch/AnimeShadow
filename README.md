<a id="top"></a>

<div align="center">

<img src="apps/web/public/icons/icon-192.png" width="96" height="96" alt="AnimeShadow" />

# 影 AnimeShadow

### Аниме-кинозал: находи, смотри, отслеживай, обсуждай — и смотри вместе

[**animeshadow.online**](https://animeshadow.online)

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
<br />
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)
<br />
[![Caddy](https://img.shields.io/badge/Caddy-HTTPS-1F88C0?style=for-the-badge&logo=caddy&logoColor=white)](https://caddyserver.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-metrics-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Telegram](https://img.shields.io/badge/Telegram-bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)

[Возможности](#-возможности) · [Архитектура](#%EF%B8%8F-архитектура) · [База данных](#%EF%B8%8F-база-данных) · [Быстрый старт](#-быстрый-старт) · [API](#-api) · [Деплой](#-деплой) · [English](#-in-english)

</div>

---

## ✨ Возможности

<table>
<tr>
<td width="50%" valign="top">

### 🎬 Просмотр
- **Свой HLS/MP4-плеер**: Kodik, AniLibria и открытый API AnimeVost; качество, скорость, PiP, жесты, горячие клавиши
- Подготовка короткого буфера на входе без автозапуска, старт одним нажатием
- Превью кадров на дорожке, отметки опенинга, эндинга и пересказа
- **Точный пропуск OP/ED** (AniSkip) под длину конкретной серии
- **Мгновенная следующая серия**: подгружается заранее, старт меньше чем за 0,5 с
- Режим **слабого интернета** и плашка скорости: «нужно ~1 Мбит/с, у вас 0,9»
- Фильтры картинки: ярче, сочнее, «старое аниме», ночной
- Прямой HLS Kodik и AniLibria в собственном плеере; переключение озвучек и серий без iframe
- Качества 1080p и 2K (1440p) для PRO; при отсутствии такого потока — масштабирование на GPU

</td>
<td width="50%" valign="top">

### 👥 Смотреть вместе
- Комнаты **до 10 человек**: пауза, перемотка и серия общие для всех
- Часы сверяются с сервером, мелкий рассинхрон догоняется плавно, без рывков
- **Ждём отстающих**: пауза у всех, пока у кого-то грузится
- Чат: смайлики, анимированные стикеры, гифки, реакции поверх видео
- «Что смотрим дальше»: предложения и голосование, автопереход
- Создатель управляет комнатой: видимость, «тихий режим», заглушить участника
- Список открытых комнат, приглашение по QR-коду, Telegram и push

</td>
</tr>
<tr>
<td valign="top">

### 📚 Каталог и поиск
- Возобновляемый импорт до 20 000 уникальных карточек: `pnpm catalog:expand`; [настройка источников](docs/player-sources.md)
- Shikimori, AniList и Kodik; расписание онгоингов на неделю
- **Умный поиск**: название, персонаж, настроение («грустное про космос»), сюжет
- Поиск **по кадру** (trace.moe) с очередью и кешем
- Подборки пользователей с лайками, рейтингом и комментариями
- Рекомендации по вашему списку и любимым жанрам

</td>
<td valign="top">

### 🔔 Уведомления
- Новые серии из «Смотрю», «В планах» и «Отложено»
- **Колокольчик** на сайте, **Telegram-бот** (`/start`, `/stop`, `/status`)
- **Web Push**, в том числе для гостей, без регистрации
- Ключи VAPID создаются сервером сами при первом запуске

</td>
</tr>
<tr>
<td valign="top">

### 🧑‍🎤 Профиль и сообщество
- Уровни, звания, рамки аватара, достижения (в том числе секретные)
- «Моя пятёрка» и **любимые моменты** с таймкодом и озвучкой
- Подписки, друзья, стена, жалобы, приватность по частям профиля
- Комментарии как на YouTube, комментарии **с таймкодом** (точки на дорожке)
- Реферальная программа и PRO

</td>
<td valign="top">

### 🛠️ Админка и SEO
- Посещаемость **по людям**, а не по браузерам, по московским суткам
- Журнал сервера (почасовые сводки), модерация, жалобы, статистика комнат
- Серверный рендер страниц для поисковиков: заголовки, Open Graph, schema.org
- sitemap с картинками, FAQ-разметка, IndexNow, `Clean-param` для Яндекса

</td>
</tr>
</table>

---

## 🏗️ Архитектура

```mermaid
flowchart LR
    U([👤 Зритель]) -->|HTTPS| C[Caddy]
    C -->|/assets, страницы| W[React SPA<br/>Vite build]
    C -->|/api, /uploads| A[Fastify API<br/>Node 20]
    C -.->|страница для бота| S[SEO-рендер<br/>в API]
    A --> DB[(PostgreSQL 16<br/>Prisma)]
    A --> FS[[Диск: картинки,<br/>гифки, логи, VAPID]]
    A -->|каталог| SH[Shikimori]
    A -->|арты, расписание| AL[AniList]
    A -->|источники| KO[Kodik / Alloha]
    A -->|HLS| LB[AniLibria]
    A -->|тайминги OP/ED| AS[AniSkip]
    A -->|поиск по кадру| TM[trace.moe]
    A -->|бот| TG[Telegram API]
    A -->|push| WP[Web Push]
    P[Prometheus] -->|/metrics| A
    U <-.->|SSE: комнаты| A
```

**Монорепозиторий на pnpm workspaces:**

```
AnimeShadow/
├── apps/
│   ├── api/            # Fastify: маршруты, сервисы, SEO-рендер, фоновые задачи
│   └── web/            # React 19 + Vite + Tailwind v4: SPA
├── packages/
│   ├── db/             # Prisma-схема, миграции, клиент
│   ├── shared/         # zod-схемы и типы, общие для фронта и бэка
│   ├── shikimori/      # клиенты внешних API
│   ├── anilist/
│   ├── anilibria/
│   ├── kodik/
│   ├── alloha/
│   └── animethemes/
├── deploy/             # Caddyfile, systemd-юнит, setup.sh, deploy.sh, Prometheus
└── docker-compose.yml  # Postgres для разработки
```

<details>
<summary><b>🔄 Как синхронизируется комната совместного просмотра</b></summary>

```mermaid
sequenceDiagram
    autonumber
    participant H as Создатель
    participant S as API (комната в памяти)
    participant M as Участник
    H->>S: GET /party-clock ×5 (смещение часов)
    M->>S: GET /party-clock ×5
    H->>S: GET /party/:code/events (SSE)
    M->>S: GET /party/:code/events (SSE)
    H->>S: POST /playback {play, 120 с}
    S-->>M: playback {playing, position, updatedAt}
    Note over M: раз в секунду: сдвиг < 0,3 с — ничего,<br/>до 2 с — скорость 0,92/1,08,<br/>больше — перемотка
    M->>S: POST /loading {true} (кончился буфер)
    S-->>H: playback {paused, waitingFor: «Аня»}
    S-->>M: playback {paused}
    M->>S: POST /loading {false} (≥ 6 с в запасе)
    S-->>H: playback {playing}
    H->>S: POST /leave
    S-->>M: closed «Создатель закрыл комнату»
    Note over S: в лог — одна строка:<br/>кто сколько смотрел
```

</details>

---

## 🗄️ База данных

PostgreSQL 16 через Prisma. **44 модели**: схема в [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma), миграции в [`packages/db/prisma/migrations`](packages/db/prisma/migrations). Ниже схема по разделам. Комнаты совместного просмотра в базе **не хранятся**: они живут в памяти API и после закрытия оставляют только строку в логе.

### Пользователи и сообщество

```mermaid
erDiagram
    User ||--o{ Follow : "подписан"
    User ||--o{ WallPost : "стена"
    User ||--o{ ProfileReport : "жалобы"
    User ||--o{ UserAchievement : "достижения"
    User ||--o{ ReferralReward : "награды"
    User ||--o{ User : "пригласил"
    User ||--o{ FavoriteMoment : "моменты"
    User ||--o{ VerificationCode : "коды"
    User {
        string id PK
        string email UK
        string username UK
        string displayName
        string telegramId UK
        string telegramChatId
        datetime proSince
        datetime proUntil
        datetime trialUntil
        string referralCode UK
        string referredById FK
        boolean notifyTelegram
        boolean notifyPush
    }
    Follow {
        string followerId PK, FK
        string followingId PK, FK
    }
    WallPost {
        string id PK
        string ownerId FK
        string authorId FK
        string body
    }
    FavoriteMoment {
        string id PK
        string userId FK
        int animeId
        int episode
        int seconds
        string dub
    }
```

### Каталог

```mermaid
erDiagram
    Anime ||--o{ GenreOnAnime : "жанры"
    Genre ||--o{ GenreOnAnime : "аниме"
    Anime ||--o{ PlayerSource : "источники"
    Anime ||--o| WatchAvailability : "есть ли видео"
    Anime ||--o{ AnimeTranslation : "переводы"
    Anime ||--o| EpisodeMark : "последняя серия"
    Anime {
        int id PK "MyAnimeList id"
        string slug UK
        string title
        string titleLocalized
        string[] screenshots
        enum type "TV, MOVIE, OVA…"
        enum airing
        int episodes
        float score
        int year
    }
    Genre {
        int id PK
        string name
    }
    PlayerSource {
        int animeId FK
        string title "озвучка"
        string kind
    }
    EpisodeMark {
        int animeId PK
        int latest
    }
```

### Просмотр и список

```mermaid
erDiagram
    User ||--o{ LibraryEntry : "список"
    User ||--o{ WatchProgress : "прогресс"
    User ||--o{ Review : "отзывы"
    User ||--o{ WatchSession : "сеансы"
    User ||--o{ UserGenrePreference : "вкусы"
    User ||--o{ UserLikedAnime : "лайки"
    Anime ||--o{ LibraryEntry : "в списках"
    Anime ||--o{ WatchProgress : "смотрят"
    Anime ||--o{ Review : "оценки"
    LibraryEntry {
        string id PK
        string userId FK
        int animeId FK
        enum status "WATCHING, PLANNED…"
        int score
        int progress
    }
    WatchProgress {
        string id PK
        string userId FK
        int animeId FK
        int episode
        int positionSeconds
        boolean completed
    }
    Review {
        string id PK
        string userId FK
        int animeId FK
        int rating
        string body
    }
```

### Комментарии и подборки

```mermaid
erDiagram
    Anime ||--o{ Comment : "обсуждение"
    User ||--o{ Comment : "пишет"
    Comment ||--o{ Comment : "ответы"
    Comment ||--o{ CommentVote : "голоса"
    Comment ||--o{ CommentReport : "жалобы"
    User ||--o{ Collection : "создаёт"
    Collection ||--o{ CollectionLike : "лайки"
    Collection ||--o{ CollectionFavorite : "сохранения"
    Collection ||--o{ CollectionRating : "оценки"
    Collection ||--o{ CollectionComment : "комментарии"
    Collection ||--o{ CollectionView : "просмотры"
    Comment {
        string id PK
        int animeId FK
        string userId FK
        string parentId FK
        string body
        int episode "таймкод"
        int atSeconds "таймкод"
        string mode "PUBLIC, ANON, SUPPORTER"
    }
    CommentReport {
        string id PK
        string commentId FK
        string reporterId FK
        string reason
        string status
    }
    Collection {
        string id PK
        string userId FK
        string title
        int[] animeIds
        json blocks
    }
```

### Уведомления

```mermaid
erDiagram
    User ||--o{ Notification : "колокольчик"
    User ||--o{ PushSubscription : "браузеры"
    Notification {
        string id PK
        string userId FK
        int animeId
        int episode
        int fromEpisode
        datetime readAt
    }
    PushSubscription {
        string id PK
        string userId FK "null у гостя"
        string visitorId
        string endpoint UK
        string p256dh
        string auth
    }
    TelegramLinkCode {
        string code PK
        string userId
        datetime expiresAt
    }
```

### Аналитика

```mermaid
erDiagram
    User ||--o{ PageView : "визиты"
    PageView }o--|| VisitorUser : "браузер → аккаунт"
    PageView }o--|| VisitorFirstSeen : "впервые"
    StatDay ||--o{ StatDayKey : "топы дня"
    PageView {
        string id PK
        string visitorId
        string userId FK
        string path
        string device
    }
    VisitorUser {
        string visitorId PK
        string userId
    }
    StatDay {
        date day PK
        string audience PK "registered / guest"
        int visitors
        int pageviews
        int sessions
    }
```

<details>
<summary><b>📋 Все модели</b></summary>

| Раздел | Модели |
|---|---|
| Аккаунт | `User`, `VerificationCode`, `PendingRegistration`, `TelegramLinkCode` |
| Сообщество | `Follow`, `WallPost`, `ProfileReport`, `ProfileVisit`, `ReferralReward`, `UserAchievement`, `FavoriteMoment` |
| Каталог | `Anime`, `Genre`, `GenreOnAnime`, `AnimeTranslation`, `PlayerSource`, `WatchAvailability`, `EpisodeMark`, `SyncState` |
| Просмотр | `LibraryEntry`, `WatchProgress`, `WatchSession`, `GuestWatchSession`, `Review`, `UserGenrePreference`, `UserLikedAnime` |
| Обсуждения | `Comment`, `CommentVote`, `CommentReport` |
| Подборки | `Collection`, `CollectionLike`, `CollectionFavorite`, `CollectionRating`, `CollectionComment`, `CollectionView` |
| Уведомления | `Notification`, `PushSubscription` |
| Аналитика | `PageView`, `VisitorUser`, `VisitorFirstSeen`, `StatDay`, `StatDayKey`, `SearchLog` |
| Игры | `GuessScore` |

</details>

---

## 🚀 Быстрый старт

> Нужны **Node ≥ 20.11**, **pnpm** и **Docker** (для Postgres).

```bash
git clone https://github.com/<you>/AnimeShadow.git
cd AnimeShadow
cp .env.example .env        # заполните JWT_SECRET и токены
pnpm setup                  # install → Postgres → prisma → пакеты → миграции → сиды
pnpm dev                    # API :4000 + сайт :5173
```

Откройте **http://localhost:5173**. Postgres слушает порт **5433**, чтобы не мешать локальной установке.

### 📜 Скрипты

| Команда | Что делает |
|---|---|
| `pnpm dev` | API и сайт с горячей перезагрузкой |
| `pnpm build` | Prisma-клиент и сборка всех пакетов и приложений |
| `pnpm typecheck` / `pnpm lint` | Проверка типов / ESLint |
| `pnpm db:up` / `pnpm db:down` | Поднять / остановить Postgres в Docker |
| `pnpm db:migrate` | Применить миграции |
| `pnpm db:studio` | Prisma Studio: база в браузере |
| `pnpm db:grant-pro` | Выдать PRO аккаунту |

### 🔐 Переменные окружения

Полный список с комментариями в [`.env.example`](.env.example).

| Переменная | Зачем |
|---|---|
| `DATABASE_URL` | Подключение к Postgres |
| `JWT_SECRET` | Подпись токенов входа (≥ 32 символа) |
| `APP_URL`, `CORS_ORIGINS` | Адрес сайта для ссылок и CORS |
| `KODIK_API_TOKEN` | Источники видео Kodik |
| `TELEGRAM_BOT_TOKEN` | Вход через Telegram и бот уведомлений |
| `VAPID_*` | Ключи Web Push (если не заданы, создаются сами в `data/vapid.json`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Письма с кодами |
| `TRACE_MOE_API_KEY` | Больше квоты для поиска по кадру |
| `YANDEX_VERIFICATION`, `GOOGLE_SITE_VERIFICATION` | Подтверждение в Вебмастере и Search Console |
| `INDEXNOW_KEY` | Мгновенное оповещение поисковиков |
| `LOG_DIR`, `LOG_KEEP_DAYS` | Где и сколько хранить сводки логов |

---

## 🔌 API

Все маршруты под `/api`. Схемы входа и выхода описаны zod-схемами в `packages/shared`.

| Группа | Примеры |
|---|---|
| Каталог | `GET /anime/:id`, `/anime/:id/watch`, `/anime/:id/skip-times`, `/search`, `/schedule` |
| Аккаунт | `POST /auth/register`, `/auth/login`, `/auth/telegram`, `GET /auth/me` |
| Список и прогресс | `/library`, `/progress`, `/me/continue` |
| Сообщество | `/comments`, `/comments/:id/report`, `/anime/:id/comment-marks`, `/users/:id/social` |
| Уведомления | `/me/notifications`, `/me/notify-settings`, `/me/telegram/link`, `/push/subscribe` |
| Совместный просмотр | `POST /party`, `GET /party`, `GET /party/:code/events` (SSE), `/playback`, `/loading`, `/chat`, `/queue` |
| Картинки | `GET /img?u=…&w=640&wm=1&f=jpg` (уменьшение, водяной знак, JPEG для превью) |
| SEO | `/seo/page/*`, `/seo-files/robots.txt`, `/seo-files/sitemap.xml` |
| Служебное | `/health`, `/metrics` (Prometheus), `/admin/*` |

---

## 🚢 Деплой

Production: Ubuntu, **Caddy** (HTTPS, раздача статики, прокси `/api`), **systemd** для API, Postgres.

```bash
# первый раз, на чистом сервере
bash deploy/setup.sh

# каждое обновление
git push origin main
ssh root@<server>
cd /var/www/animeshadow && bash deploy/deploy.sh
```

`deploy.sh` подтягивает код, ставит зависимости, применяет миграции, собирает, проверяет новую сборку на запасном порту и только после этого перезапускает API.

---

## 🔒 Безопасность

- Пароли хранятся в виде **bcrypt**-хешей; токены **JWT** с версией (выход со всех устройств).
- Жёсткая **CSP**, `helmet`, rate-limit на каждом изменяющем маршруте.
- Токены провайдеров никогда не попадают на фронтенд.
- 18+ закрыто подтверждением возраста; Rx не показывается никогда.
- Видео сайт **не хранит**: потоки отдают сторонние провайдеры в момент просмотра.

---

<a id="-in-english"></a>

## 🇬🇧 In English

**AnimeShadow** is a dark, cinema-styled anime catalogue and player: Shikimori/AniList/Kodik catalogue, a custom HLS player (exact OP/ED skipping via AniSkip, instant next episode, low-bandwidth mode, frame previews), **watch parties for up to 10 people** (server-synced clocks, smooth drift correction, waiting for the slowest viewer, chat with stickers/GIFs, a vote-driven "what's next" queue), new-episode notifications via a Telegram bot and Web Push, rich profiles with levels and achievements, YouTube-style and time-coded comments, and server-rendered SEO pages.

**Stack:** React 19 · Vite · Tailwind v4 · Fastify 5 · PostgreSQL 16 · Prisma · pnpm workspaces · Caddy · Prometheus.

```bash
cp .env.example .env && pnpm setup && pnpm dev   # → http://localhost:5173
```

---

<div align="center">

Сделано с ❤️ для тех, кто смотрит аниме

[⬆ Наверх](#top)

</div>
