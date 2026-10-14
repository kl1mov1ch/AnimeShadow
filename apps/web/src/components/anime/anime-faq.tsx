import type { AnimeDetail } from "@animeshadow/shared";
import { ChevronDownIcon, CircleHelpIcon } from "lucide-react";
import { useWatchSources } from "@/lib/query";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * "Частые вопросы": where to watch, how many episodes, which dubs, what it's
 * about — the same answers the page gives search engines, here for people.
 */
export function AnimeFaq({ anime, title }: { anime: AnimeDetail; title: string }) {
  const { data } = useWatchSources(anime.id);
  const dubs = [...new Set((data?.sources ?? []).map((s) => s.title.replace(/\s*·.*$/, "")).filter((t) => t && !/субтитр|subtitle/i.test(t)))].slice(0, 8);
  const year = anime.year ? ` (${anime.year})` : "";
  const eps = anime.episodes ? `${anime.episodes} ${plural(anime.episodes, "серия", "серии", "серий")}` : null;
  const items: Array<[string, string]> = [
    [
      `Где смотреть «${title}» онлайн бесплатно?`,
      `Прямо здесь, на AnimeShadow: «${title}»${year}${eps ? ` — ${eps}` : ""} в хорошем качестве${dubs.length ? `, с озвучкой ${dubs.slice(0, 4).join(", ")}` : ""}. Без регистрации; с аккаунтом сайт запомнит, где вы остановились.`,
    ],
    ...(eps && anime.type !== "MOVIE"
      ? [[`Сколько серий в аниме «${title}»?`, `${anime.airing === "AIRING" ? "Аниме ещё выходит. Запланировано" : "Всего"} ${eps}${anime.duration ? ` по ${anime.duration}` : ""}.`] as [string, string]]
      : []),
    ...(dubs.length ? [[`В какой озвучке есть «${title}»?`, `Доступны озвучки: ${dubs.join(", ")}. Переключить можно прямо в плеере.`] as [string, string]] : []),
    ...(anime.synopsis ? [[`О чём аниме «${title}»?`, anime.synopsis.length > 320 ? `${anime.synopsis.slice(0, 319)}…` : anime.synopsis] as [string, string]] : []),
    [`Можно ли смотреть «${title}» вместе с друзьями?`, "Да: «Вместе» над плеером создаёт комнату — до 10 человек смотрят один момент, с чатом и реакциями."],
  ];
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-card/40 p-4">
      <h2 className="flex items-center gap-2 font-display text-lg">
        <CircleHelpIcon className="size-5 text-primary" />
        Частые вопросы
      </h2>
      {items.map(([q, a]) => (
        <details key={q} className="group rounded-xl bg-foreground/[0.03] px-3 py-2.5 open:bg-foreground/[0.05]">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{q}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </details>
      ))}
    </section>
  );
}
