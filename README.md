# AnimeShadow

A screening-room catalogue for anime. Discover what's airing, dig into any
title, and keep a personal watch list — built on the free
[Jikan](https://jikan.moe) (MyAnimeList) API.

```
Postgres  ──►  Prisma  ──►  Fastify API  ──►  React + shadcn/ui (Vite)
   ▲                            │
   └──── read-through cache ────┘   (Jikan is topped up on demand)
```

## Stack

| Layer     | Choice | Why |
| --------- | ------ | --- |
| Language  | TypeScript (strict, ESM) everywhere | one type system across the wire |
| Database  | PostgreSQL 16 (Docker) | relational data: users, library, cached catalogue |
| ORM       | Prisma 6 + `@prisma/adapter-pg` driver adapter | typed queries, migrations |
| API       | Fastify 5 | fast, first-class TS, plugin encapsulation, schema hooks |
| Validation| Zod (shared package) | one contract for API boundary **and** frontend forms |
| Auth      | `@fastify/jwt` + bcrypt | stateless bearer tokens |
| Frontend  | React 19 + Vite 6 | fast dev server, native ESM, route-level code splitting |
| Data      | TanStack Query 5 | request dedup, caching, background refetch |
| UI        | shadcn/ui (Radix base) + Tailwind CSS v4 | composable primitives, semantic tokens |
| Routing   | React Router 7 (data router, lazy routes) | |

## Repository layout

```
apps/
  api/        Fastify server — routes, services, plugins
  web/        Vite + React SPA
packages/
  shared/     Zod schemas + inferred types for every API contract
  jikan/      Rate-limited Jikan client + raw→DTO mappers  (a "deep module")
  db/         Prisma schema, client singleton, catalogue read/write helpers
docker-compose.yml   Postgres 16 on host port 5433
```

### Design notes

- **The catalogue is a read-through cache.** `CatalogService` checks Postgres
  first; on a miss or a stale row it fetches from Jikan, persists, and returns.
  If Jikan is unavailable it serves whatever is cached (even if stale) so the
  product degrades instead of erroring. Callers see six intent-named methods and
  none of the machinery.
- **One validation contract.** `@animeshadow/shared` holds the Zod schemas. The
  API parses requests with them at the route boundary; the frontend reuses the
  same schemas for form validation and reads the field-keyed error map the API
  returns.
- **The Jikan client is a deep module.** A handful of methods over a hidden
  single-flight rate limiter, retry-with-backoff (honours `Retry-After`), and
  request timeouts.
- **Visual identity — "projection booth".** A darkened screening room where the
  cover art is the light source: a poster casts a blurred, colour-matched glow
  onto the surface behind it (the "shadow" the app is named for), plus a faint
  film grain over the dark theme. That is the one bold move; everything else
  stays quiet. One typeface, Zen Kaku Gothic New, carries both the 900-weight
  display voice and the 400-weight UI voice and covers Japanese titles natively.
  Motion is deliberate: one orchestrated reveal on the Discover hero, a
  streaming-style info panel on card hover, a 160ms route fade — all disabled
  under `prefers-reduced-motion`. Light and dark themes, keyboard focus,
  responsive to mobile.
- **Russian & English.** UI strings, genre names and all labels are localised
  (switcher in the header, choice persisted). Free text from Jikan is localised
  on the detail endpoint: Russian titles and synopses come from **Shikimori**
  (human-written) first, then fall back to keyless machine translation (Google →
  MyMemory). Every result is cached in Postgres forever.
- **Reviews.** Per-user reviews (one per title): rating + body, with an average
  and rating distribution. Own review is editable/removable inline.
- **Watch tab.** The app never hosts video. The player is resolved through
  [`kodikwrapper`](https://github.com/thedvxch/kodikwrapper) (a Node client for
  kodikapi.com) by Shikimori/MAL id — many RU dubs + subtitles, with a picker;
  or any `{malId}` iframe via `WATCH_EMBED_TEMPLATE`. `KODIK_API_TOKEN` defaults
  to a public demo token; get your own at kodik.cc. Availability is cached
  (`WatchAvailability`) and warmed on boot so cards can badge **Watch** vs
  **Coming soon**; `?hasPlayer=true` filters to playable titles. The trailer is
  a separate button (opens in a dialog), never inline.
- **Smart search.** `GET /api/search` reads one query through four lenses in
  parallel — **title** (cache + Jikan), **character name** (Jikan
  `/characters` → its anime), **mood/vibe** (RU+EN keyword → genre map, e.g.
  "грустное про космос" → Drama + Space), and **synopsis** text (cache, incl.
  the Russian translation) — then merges, de-dupes and ranks. The header search
  is an inline combobox: results drop in under the input as you type (poster +
  title with fuzzy-match highlight via `fuse.js`, grouped by lens), with recent
  searches and one-tap mood chips.

## Prerequisites

- Node.js ≥ 20.11 (tested on 24)
- pnpm ≥ 11 (`corepack enable`)
- Docker (for Postgres) — or your own Postgres, see below

## Quick start

```bash
# 1. Configuration
cp .env.example .env          # defaults work as-is for local dev

# 2. One-time setup: install, start Postgres, migrate, seed the catalogue
pnpm install
pnpm setup
#   └─ pnpm db:up && pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 3. Run API + web together
pnpm dev
```

- Web: <http://localhost:5173> (Vite picks the next free port if 5173 is taken)
- API: <http://localhost:4000/api>  (`/api` is proxied by the Vite dev server)

The dev frontend talks to the API through Vite's `/api` proxy, so there is no
CORS to configure. Leave `VITE_API_URL` empty unless you host the frontend on a
different origin than the API.

### Using your own Postgres

Point `DATABASE_URL` in `.env` at it and skip `pnpm db:up`. Then
`pnpm db:generate && pnpm db:migrate && pnpm db:seed`.

## Scripts

| Command | Effect |
| ------- | ------ |
| `pnpm dev` | API + web with hot reload |
| `pnpm dev:api` / `pnpm dev:web` | one side only |
| `pnpm build` | build every package and app |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm db:up` / `pnpm db:down` | start / stop the Postgres container |
| `pnpm db:migrate` | create & apply a migration (`prisma migrate dev`) |
| `pnpm db:seed` | fill the catalogue from Jikan (idempotent) |
| `pnpm db:studio` | open Prisma Studio |

## API surface

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET` | `/api/health` | liveness + DB check |
| `GET` | `/api/discover` | spotlight + rails (10-min server cache); `?lang=ru\|en` |
| `GET` | `/api/anime` | browse: `page, perPage, type, airing, genres, minScore, year, season, orderBy, sort, hasPlayer` |
| `GET` | `/api/search` | smart search: `q, lang` — grouped, ranked results across title/character/mood/synopsis |
| `GET` | `/api/anime/:id` | full detail (read-through cache); `?lang=ru\|en` localises title + synopsis |
| `GET` | `/api/anime/:id/characters` | main cast |
| `GET` | `/api/anime/:id/recommendations` | "more like this" |
| `GET` | `/api/anime/:id/watch` | embed player sources (or `not_configured`) |
| `GET` `PUT` `DELETE` | `/api/anime/:id/reviews` | list (+summary) / upsert own / delete own |
| `GET` | `/api/genres` | genre list with counts |
| `POST` | `/api/auth/register` · `/api/auth/login` | → `{ token, user }` |
| `GET` | `/api/auth/me` | current user (bearer) |
| `GET` | `/api/library` · `/api/library/summary` | personal list (bearer) |
| `PUT` | `/api/library/:animeId` | upsert `{ status, score?, progress?, notes? }` |
| `DELETE` | `/api/library/:animeId` | remove |

Every error response is `{ "error": { "code", "message", "fields"? } }`.

## Production build

```bash
pnpm build
pnpm --filter @animeshadow/db migrate:deploy   # against the real DATABASE_URL
node apps/api/dist/server.js                    # serve the API
# serve apps/web/dist as static files; set VITE_API_URL before `pnpm --filter web build`
```

## Notes

- Jikan is a community API and occasionally returns `504`s under load. The
  client retries, then the service degrades gracefully (empty section, stale
  cache). Re-run `pnpm db:seed` any time — it upserts.
- Postgres is published on host port **5433** to avoid clashing with a local
  Postgres on 5432. Change `POSTGRES_PORT` in `.env` if you like.
