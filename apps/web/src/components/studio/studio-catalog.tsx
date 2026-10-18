import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRightIcon,
  CheckIcon,
  Clock3Icon,
  PlayIcon,
  SearchIcon,
} from "lucide-react";
import { AnimePoster } from "@/components/anime/anime-poster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STUDIO_PATH, type StudioAnime } from "./studio-data";
import { StudioWatchDialog } from "./studio-watch-dialog";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import officialPosters from "./honkon-posters.json";

const studioPosters = officialPosters as Record<
  string,
  { image: string; source: string }
>;

export function StudioCatalog({
  releases,
  loading,
  error,
  retry,
  compact = false,
}: {
  releases: StudioAnime[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<StudioAnime | null>(null);
  const filtered = releases.filter(
    (anime) =>
      (filter === "all" ||
        (filter === "finished"
          ? anime.airing === "FINISHED"
          : anime.airing === "AIRING")) &&
      `${anime.titleLocalized} ${anime.title}`
        .toLocaleLowerCase("ru")
        .includes(query.toLocaleLowerCase("ru").trim()),
  );
  const visible =
    compact && !query && filter === "all" ? filtered.slice(0, 8) : filtered;
  return (
    <section id="hk-releases" className="hk-catalog" aria-label="Релизы Hon-Kon Studio">
      <div className="hk-section-heading">
        <div>
          <p className="hk-eyebrow">Истории с нашим голосом</p>
          <h2 className="hk-branded-heading">
            <HonkonGlyph aria-hidden />
            Релизы
            <span className="hk-heading-count">
              {loading || error ? "" : releases.length}
            </span>
          </h2>
        </div>
        <label className="hk-search">
          <SearchIcon aria-hidden />
          <span className="sr-only">Поиск по релизам студии</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти аниме"
          />
        </label>
      </div>
      <div className="hk-catalog-toolbar">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(value) => value && setFilter(value)}
          aria-label="Фильтр релизов"
          className="hk-filters"
        >
          <ToggleGroupItem value="all">Все работы</ToggleGroupItem>
          <ToggleGroupItem value="ongoing">Выходят</ToggleGroupItem>
          <ToggleGroupItem value="finished">Завершены</ToggleGroupItem>
        </ToggleGroup>
        <span className="hk-result-count">
          {loading ? "Загружаем…" : error ? "" : `Найдено: ${filtered.length}`}
        </span>
      </div>
      {error ? (
        <div className="hk-load-state" role="alert">
          <h3>Не удалось загрузить релизы</h3>
          <p>Проверьте соединение и повторите запрос.</p>
          <Button variant="outline" onClick={retry}>
            Повторить
          </Button>
        </div>
      ) : loading ? (
        <div className="hk-load-state" role="status">
          Загружаем работы студии…
        </div>
      ) : (
        <>
          <div className="hk-release-grid">
            {visible.map((anime) => (
              <article className="hk-release" key={anime.id}>
                <button
                  type="button"
                  className="hk-release-art"
                  onClick={() => setSelected(anime)}
                  aria-label={`Смотреть: ${anime.titleLocalized || anime.title}`}
                >
                  {studioPosters[anime.id] ? (
                    <img
                      src={studioPosters[anime.id]!.image}
                      srcSet={`/studios/hon-kon/posters/${anime.id}-240.webp 240w, /studios/hon-kon/posters/${anime.id}-480.webp 480w`}
                      sizes="(max-width: 479px) 44vw, (max-width: 639px) 29vw, (max-width: 849px) 22vw, (max-width: 1099px) 18vw, 200px"
                      alt={anime.titleLocalized || anime.title}
                      width={480}
                      height={640}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <AnimePoster
                      anime={anime}
                      title={anime.titleLocalized || anime.title}
                    />
                  )}
                  <span
                    className={`hk-release-status ${anime.airing === "FINISHED" ? "hk-status-finished" : anime.airing === "AIRING" ? "hk-status-ongoing" : "hk-status-soon"}`}
                  >
                    {anime.airing === "AIRING" ? (
                      <span className="hk-live-indicator" aria-hidden="true" />
                    ) : anime.airing === "FINISHED" ? (
                      <CheckIcon aria-hidden />
                    ) : (
                      <Clock3Icon aria-hidden />
                    )}
                    {anime.airing === "FINISHED"
                      ? "Завершён"
                      : anime.airing === "AIRING"
                        ? "Выходит"
                        : "Скоро"}
                  </span>
                  <span className="hk-release-play" aria-hidden="true">
                    <PlayIcon aria-hidden />
                  </span>
                  <span className="hk-release-signature" aria-hidden="true">
                    <HonkonGlyph />
                    <span>Hon-Kon</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="hk-release-title"
                  onClick={() => setSelected(anime)}
                  title={anime.titleLocalized || anime.title}
                >
                  {anime.titleLocalized || anime.title}
                </button>
                <p>
                  {anime.year && <span>{anime.year}</span>}
                  <span>{anime.availableEpisodes} сер.</span>
                </p>
              </article>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="hk-load-state">
              <h3>Аниме не найдено</h3>
              <p>Попробуйте другое название.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Сбросить фильтры
              </Button>
            </div>
          )}
          {visible.length < filtered.length && (
            <div className="hk-all-releases">
              <Button variant="outline" asChild>
                <Link to={`${STUDIO_PATH}/releases`}>
                  Все релизы
                  <ArrowRightIcon data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
      <StudioWatchDialog anime={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
