import type { AdminExternalAnalytics } from "@animeshadow/shared";
import { env } from "../config/env.js";
import { TtlCache } from "./cache.js";

type YandexStats = NonNullable<AdminExternalAnalytics["yandex"]["stats"]>;

const cache = new TtlCache<{ stats: YandexStats | null; error: string | null }>(10 * 60_000, 16);

/**
 * Which third-party counters are on, links to their dashboards, and — when
 * a Yandex OAuth token is configured — Metrica's own summary for the last
 * 30 days, read from its Reporting API on the server (the token never
 * reaches the browser).
 */
export async function externalAnalytics(): Promise<AdminExternalAnalytics> {
  const ym = env.VITE_YM_ID ?? null;
  const yandex = ym && env.YM_OAUTH_TOKEN ? await cache.wrap(ym, () => yandexStats(ym, env.YM_OAUTH_TOKEN!)) : null;
  return {
    yandex: {
      counterId: ym,
      dashboardUrl: ym ? `https://metrika.yandex.ru/dashboard?id=${ym}` : null,
      stats: yandex?.stats ?? null,
      error: ym && !env.YM_OAUTH_TOKEN ? "Нет YM_OAUTH_TOKEN — сводка Метрики в админке выключена" : (yandex?.error ?? null),
    },
    google: {
      measurementId: env.VITE_GA_ID ?? null,
      dashboardUrl: env.VITE_GA_ID ? "https://analytics.google.com/analytics/web/" : null,
    },
    umami: {
      websiteId: env.VITE_UMAMI_ID ?? null,
      dashboardUrl: env.UMAMI_DASHBOARD_URL ?? null,
    },
  };
}

async function yandexStats(counter: string, token: string): Promise<{ stats: YandexStats | null; error: string | null }> {
  const call = async (params: Record<string, string>) => {
    const url = new URL("https://api-metrika.yandex.net/stat/v1/data");
    url.search = new URLSearchParams({ ids: counter, date1: "30daysAgo", date2: "today", accuracy: "full", ...params }).toString();
    const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Метрика ответила ${res.status}`);
    return (await res.json()) as {
      totals?: number[];
      data?: Array<{ dimensions: Array<{ name: string | null }>; metrics: number[] }>;
    };
  };
  try {
    const [totals, sources, phrases] = await Promise.all([
      call({ metrics: "ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds" }),
      call({ metrics: "ym:s:visits", dimensions: "ym:s:lastTrafficSource", sort: "-ym:s:visits", limit: "10" }),
      call({ metrics: "ym:s:visits", dimensions: "ym:s:lastSearchPhrase", sort: "-ym:s:visits", limit: "15" }),
    ]);
    const t = totals.totals ?? [];
    const rows = (r: typeof sources) =>
      (r.data ?? []).map((d) => ({ name: d.dimensions[0]?.name ?? "—", visits: Math.round(d.metrics[0] ?? 0) }));
    return {
      stats: {
        visits: Math.round(t[0] ?? 0),
        users: Math.round(t[1] ?? 0),
        pageviews: Math.round(t[2] ?? 0),
        bounceRate: (t[3] ?? 0) / 100,
        avgVisitSec: Math.round(t[4] ?? 0),
        sources: rows(sources),
        searchPhrases: rows(phrases),
      },
      error: null,
    };
  } catch (error) {
    return { stats: null, error: error instanceof Error ? error.message : "Метрика недоступна" };
  }
}
