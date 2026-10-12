# Kodik в своём плеере — через официальный партнёрский доступ

Как сделать, чтобы тайтлы Kodik играли в нашем плеере (качество, опенинги,
жесты, без чужого iframe) **законным путём**: по прямым ссылкам, которые Kodik
выдаёт партнёрам по отдельному токену.

> Этот документ не про парсинг плеера Kodik. Извлекать поток из
> `kodikplayer.com` в обход их плеера, рекламы и привязки к токену нельзя —
> ни в проде, ни «для теста». Всё ниже работает только с тем, что Kodik
> выдаст по договору, и строго в рамках его условий.

---

## 1. Получить доступ

1. Войдите в партнёрский кабинет Kodik (тот аккаунт, чей токен стоит в
   `KODIK_API_TOKEN`).
2. Напишите в поддержку Kodik: нужен доступ к **прямым ссылкам на видео
   (direct links / API потоков)** для сайта, укажите домен и примерный трафик.
3. От ответа зависит всё остальное. Запишите себе:
   - адрес метода (endpoint) и как в него передаётся тайтл, озвучка и серия;
   - формат ответа (HLS `.m3u8` или `mp4`, какие качества);
   - нужны ли заголовки (Referer, подпись) и сколько живёт ссылка;
   - **условия**: можно ли отдавать ссылку браузеру напрямую, нужно ли
     показывать их рекламу, можно ли кэшировать/проксировать поток.

Без этих ответов код писать не нужно — от условий зависит шаг 4.

## 2. Положить токен на сервер

Переменная уже объявлена:
[apps/api/src/config/env.ts:64-68](../apps/api/src/config/env.ts#L64-L68)

```ts
KODIK_DIRECT_TOKEN: z.string().optional(),
```

На сервере — в `/var/www/animeshadow/.env` (не в `apps/web`, не в `VITE_*`):

```env
KODIK_DIRECT_TOKEN=токен_из_договора
```

Дальше она идёт так (уже подключено, менять не нужно):

| Где | Что |
|---|---|
| [apps/api/src/plugins/services.ts:31](../apps/api/src/plugins/services.ts#L31) | `kodikDirectToken: env.KODIK_DIRECT_TOKEN` |
| [apps/api/src/services/container.ts:199](../apps/api/src/services/container.ts#L199) | передаётся в `WatchService` |
| [apps/api/src/services/watch.service.ts:161](../apps/api/src/services/watch.service.ts#L161) | хранится в `this.kodikDirectToken` |

Токен никогда не уходит во фронтенд — браузер получает только готовый URL.

## 3. Реализовать адаптер — один файл

Вся интеграция сделана «швом» в одном месте:
[packages/kodik/src/direct.ts](../packages/kodik/src/direct.ts)

Сейчас `resolveDirectSources()` без токена возвращает `[]`, а с токеном —
бросает ошибку «не реализовано». Её тело заменяется вызовом метода из вашего
договора. Контракт уже описан:

- вход — [`KodikEpisodeRef`](../packages/kodik/src/direct.ts#L43-L50): `kodikId`, `translationId`, `episode`;
- выход — массив [`KodikDirectSource`](../packages/kodik/src/direct.ts#L56-L72): `format`, `url`, `quality`, `headers?`, `durationSeconds?`.

Каркас (адрес и поля ответа подставьте из документации Kodik — здесь они
условные):

```ts
// packages/kodik/src/direct.ts
const DIRECT_ENDPOINT = "https://…адрес из договора…";

export async function resolveDirectSources(
  ref: KodikEpisodeRef,
  options: KodikDirectOptions = {},
): Promise<KodikDirectSource[]> {
  if (!options.accessToken) return [];
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = new URL(DIRECT_ENDPOINT);
  url.searchParams.set("token", options.accessToken);   // как велит договор
  url.searchParams.set("id", ref.kodikId);
  url.searchParams.set("translation_id", ref.translationId);
  url.searchParams.set("episode", String(ref.episode));

  const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Kodik direct ${res.status}`);
  const body = (await res.json()) as {
    // форма ответа — из документации Kodik
    links?: Array<{ quality: string; url: string; type: "hls" | "mp4" }>;
  };

  return (body.links ?? [])
    .filter((l) => l.url.startsWith("https://"))
    .map((l) => ({ format: l.type, url: l.url, quality: l.quality }));
}
```

Проверить отдельно от сайта:

```bash
pnpm --filter @animeshadow/kodik build
cd apps/api
KODIK_DIRECT_TOKEN=… pnpm exec tsx -e '
  import { resolveDirectSources } from "@animeshadow/kodik";
  console.log(await resolveDirectSources(
    { kodikId: "serial-10015", translationId: "610", episode: 1 },
    { accessToken: process.env.KODIK_DIRECT_TOKEN },
  ));'
```

## 4. Довести до плеера

Наш плеер уже умеет HLS-источники — так играет AniLibria. Kodik-источник
должен прийти в том же виде.

### 4.1. Форма источника

[packages/shared/src/watch.ts:4-71](../packages/shared/src/watch.ts#L4-L71) — `WatchSource`:

- `format: "hls"` — включает наш плеер;
- `hlsEpisodes: { "1": url, "2": url, … }` — лучшая ссылка на каждую серию;
- `hlsVariants: { "1": { "720": url, "1080": url }, … }` — для выбора качества;
- `episodeMeta` — необязательно (опенинги для кнопки «пропустить»).

Пример, как это заполняет AniLibria:
[apps/api/src/services/watch.service.ts — fetchAnilibria()](../apps/api/src/services/watch.service.ts#L443)

### 4.2. Что доделать в `withDirectSources` и сервисе

Сейчас:

- [watch.service.ts:384-398](../apps/api/src/services/watch.service.ts#L384-L398) — `kodikDirect()` спрашивает только `episode: 1`;
- [watch.service.ts:543-549](../apps/api/src/services/watch.service.ts#L543-L549) — для каждой озвучки вызывается `withDirectSources(s, direct)`;
- [direct.ts:112-123](../packages/kodik/src/direct.ts#L112-L123) — `withDirectSources` меняет `format` на `hls`, но **не заполняет `hlsEpisodes`/`hlsVariants`**.

Нужно:

1. В `kodikDirect()` пройти по сериям (число серий — `s.episodesCount`),
   ограничив параллельность (2–3 запроса) и общий таймаут, либо, если
   договор даёт метод «весь сериал одним запросом», — использовать его.
2. В `withDirectSources` собрать карты:

```ts
export function withDirectSources(
  source: WatchSource,
  byEpisode: Map<number, KodikDirectSource[]>,
): WatchSource {
  const hlsEpisodes: Record<string, string> = {};
  const hlsVariants: Record<string, Record<string, string>> = {};
  for (const [episode, list] of byEpisode) {
    const hls = list.filter((d) => d.format === "hls");
    if (hls.length === 0) continue;
    const key = String(episode);
    hlsVariants[key] = Object.fromEntries(
      hls.filter((d) => d.quality).map((d) => [d.quality!.replace(/p$/, ""), d.url]),
    );
    hlsEpisodes[key] = hls[0]!.url; // или лучшая по quality
  }
  if (Object.keys(hlsEpisodes).length === 0) return source; // откат на iframe
  return { ...source, format: "hls", hlsEpisodes, hlsVariants };
}
```

3. **Если ссылки живут недолго** (подписанные, на час) — не сохранять их в
   `PlayerSource` надолго: либо брать на лету при открытии серии (отдельный
   эндпоинт рядом с `GET /api/anime/:id/watch` в [routes/anime.ts](../apps/api/src/routes/anime.ts#L218)), либо ставить
   короткий TTL кэша в `WatchService`.
4. **Если поток требует заголовков** (`headers` в `KodikDirectSource`):
   браузер их не добавит. Тогда либо по договору ссылка должна открываться
   без них, либо нужен серверный прокси — **только если условия Kodik это
   разрешают**.

### 4.3. Фронтенд

Ничего не нужно, если источник пришёл в виде из п. 4.1:

- [apps/web/src/components/anime/watch-section.tsx:129](../apps/web/src/components/anime/watch-section.tsx#L129) — все `format === "hls"` идут в наш плеер;
- [watch-section.tsx:897](../apps/web/src/components/anime/watch-section.tsx#L897) — `CustomHlsPlayer`;
- [watch-section.tsx:2344-2351](../apps/web/src/components/anime/watch-section.tsx#L2344-L2351) — передача `hlsVariants` (выбор качества);
- [apps/web/src/lib/episodes.ts](../apps/web/src/lib/episodes.ts) — список серий.

Если договор требует показывать рекламу Kodik — её показ нужно встроить по
их инструкции, а не убирать.

### 4.4. Отметка «свой плеер»

Флаг `hasCustomPlayer` (кнопка «Без рекламы», подборка, герой главной)
считается по наличию HLS-источника:
[watch.service.ts:666](../apps/api/src/services/watch.service.ts#L666)
(`sources.some((s) => s.format === "hls")`).
Если реклама Kodik по договору обязательна, «Без рекламы» для таких тайтлов
показывать нельзя — нужен отдельный признак.

## 5. Проверка локально

```bash
# .env в корне
KODIK_DIRECT_TOKEN=…

pnpm dev
# открыть тайтл, у которого есть Kodik и нет AniLibria, например
# http://localhost:5173/anime/60636
```

Что смотреть:

- `GET http://localhost:4000/api/anime/60636/watch` ([apps/api/src/routes/anime.ts:218](../apps/api/src/routes/anime.ts#L218)) — у Kodik-источников
  `format: "hls"` и заполнен `hlsEpisodes`;
- в плеере — наш интерфейс, переключение качества, переход между сериями;
- в логах API нет `kodik direct source failed`;
- без токена всё работает как раньше (iframe) — это обязательный откат.

## 6. Деплой

```bash
# на сервере
echo 'KODIK_DIRECT_TOKEN=…' >> /var/www/animeshadow/.env
cd /var/www/animeshadow && bash deploy/deploy.sh
```

Токен не коммитить. Если Kodik отзовёт доступ — удалить переменную, сайт
вернётся к их встроенному плееру сам.
