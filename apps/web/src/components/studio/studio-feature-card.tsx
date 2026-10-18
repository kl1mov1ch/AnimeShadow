import { Link } from "react-router-dom";
import { ArrowRightIcon } from "lucide-react";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { useStudioCatalog } from "./studio-data";

/** A pinned entry, backed by the same live releases as the studio page. */
export function StudioFeatureCard() {
  const catalog = useStudioCatalog();
  return (
    <section
      aria-label="Подборка Hon-Kon Studio"
      className="relative isolate grid min-w-0 gap-4 overflow-hidden rounded-2xl border border-primary/25 bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
    >
      <HonkonGlyph className="pointer-events-none absolute -right-4 -top-9 -z-10 size-44 rotate-12 text-primary/10" />
      <div className="min-w-0">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-primary">
          <HonkonGlyph className="size-6" />
          Закреплённая подборка
        </p>
        <h2 className="font-display text-lg sm:text-xl">Голоса Hon-Kon Studio</h2>
        <p className="mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">
          Истории в озвучке команды
          {catalog.data ? ` · ${catalog.data.releases.length} тайтлов` : ""}. Выбирайте
          аниме и смотрите вместе.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/studio/hon-kon/releases"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Релизы студии
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          to="/studio/hon-kon"
          className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-xs font-medium transition-colors hover:bg-muted"
        >
          О команде
        </Link>
      </div>
    </section>
  );
}
