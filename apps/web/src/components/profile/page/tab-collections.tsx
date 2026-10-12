import type { PublicProfile } from "@animeshadow/shared";
import { BarChart3Icon, LayersIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { CollectionCard } from "@/components/collections/collection-card";
import { useUserCollections } from "@/lib/query";
import { EmptyNote } from "./kit";

/** Their collections, as the catalogue of collections shows them; on one's
 *  own profile, making a new one and the collections' statistics. */
export function CollectionsTab({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const { data, isPending } = useUserCollections(profile.id);
  const items = data?.items ?? [];
  return (
    <div className="flex flex-col gap-4">
      {own && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/collections/new"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5"
          >
            <PlusIcon className="size-4" />
            Новая подборка
          </Link>
          {items.length > 0 && (
            <Link
              to="/collections/stats"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--accent-line-soft)] px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/10"
            >
              <BarChart3Icon className="size-4" />
              Статистика
            </Link>
          )}
          {data?.limit && data.limit.max != null && (
            <span className="text-xs text-muted-foreground">
              {data.limit.used} из {data.limit.max}
            </span>
          )}
        </div>
      )}
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-foreground/[0.05]" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote
          icon={LayersIcon}
          title={own ? "У вас пока нет подборок" : "Подборок пока нет"}
          hint={own ? "Соберите тайтлы под настроение — их увидят все." : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((collection, i) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              className="animate-in fade-in-0 slide-in-from-bottom-2"
              style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
