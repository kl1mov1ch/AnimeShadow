import type { FavoriteMoment } from "@animeshadow/shared";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, MicIcon, PencilIcon, PlayIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { imageSrc } from "@/lib/format";
import { clock, momentHref, useRemoveMoment, useUpdateMoment } from "@/lib/moments";
import { cn } from "@/lib/utils";

/**
 * Favourite moments: up to five scenes, each an episode at a second with the
 * dub it was watched in and a few words — a click plays it from there.
 * The owner can reorder, caption and remove them.
 */
export function MomentsStrip({ items, own }: { items: FavoriteMoment[]; own: boolean }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--accent-line-soft)] px-4 py-8 text-center">
        <PlayIcon className="size-6 text-primary" />
        <p className="text-sm font-medium">{own ? "Любимых моментов пока нет" : "Моментов пока нет"}</p>
        {own && (
          <p className="max-w-sm text-xs text-muted-foreground">
            Во время просмотра нажмите «Любимый момент» над плеером — сцена сохранится с серией, таймкодом и озвучкой.
          </p>
        )}
      </div>
    );
  }
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-4">
      {items.map((m, i) => (
        <MomentCard key={m.id} moment={m} index={i} total={items.length} own={own} />
      ))}
    </ol>
  );
}

function MomentCard({ moment, index, total, own }: { moment: FavoriteMoment; index: number; total: number; own: boolean }) {
  const update = useUpdateMoment();
  const remove = useRemoveMoment();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(moment.note ?? "");
  const title = moment.anime.titleLocalized || moment.anime.title;

  return (
    <li className="min-w-0">
      <Link to={momentHref(moment)} className="group block">
        <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl bg-muted shadow-lg shadow-black/30 ring-1 ring-white/5">
          {moment.anime.imageUrl && <img src={imageSrc(moment.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
          <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
          <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 font-display text-xs text-white">{index + 1}</span>
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <PlayIcon className="size-5 fill-current" />
            </span>
          </span>
          <span className="absolute inset-x-1.5 bottom-1.5 flex min-w-0 flex-col gap-1 sm:inset-x-2 sm:bottom-2">
            <span className="w-fit max-w-full truncate rounded-md bg-primary px-1 py-0.5 font-mono text-[9.5px] font-bold tabular-nums text-primary-foreground sm:px-1.5 sm:text-[11px]">
              {moment.episode} серия · {clock(moment.seconds)}
            </span>
            {moment.dub && (
              <span className="flex min-w-0 items-center gap-1 text-[10px] text-white/80">
                <MicIcon className="size-3 shrink-0" />
                <span className="truncate">{moment.dub}</span>
              </span>
            )}
          </span>
        </span>
        <span className="mt-2 line-clamp-1 block text-xs font-medium leading-snug group-hover:text-primary">{title}</span>
      </Link>

      {editing ? (
        <form
          className="mt-1 flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ id: moment.id, note: note.trim() || null }, { onSuccess: () => setEditing(false) });
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 80))}
            placeholder="Пара слов о сцене"
            autoFocus
            className="h-7 min-w-0 flex-1 rounded-md border border-[var(--accent-line-soft)] bg-transparent px-2 text-[11px] outline-none focus:border-primary/50"
          />
          <button type="submit" aria-label="Сохранить" className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <CheckIcon className="size-3.5" />
          </button>
          <button type="button" aria-label="Отмена" onClick={() => setEditing(false)} className="grid size-7 place-items-center rounded-md text-muted-foreground">
            <XIcon className="size-3.5" />
          </button>
        </form>
      ) : (
        moment.note && <p className="mt-0.5 line-clamp-2 text-[11px] italic leading-snug text-muted-foreground">«{moment.note}»</p>
      )}

      {own && !editing && (
        <div className="mt-1 flex items-center gap-0.5 text-muted-foreground">
          {[
            { icon: ArrowLeftIcon, label: "Левее", off: index === 0, run: () => update.mutate({ id: moment.id, position: index - 1 }) },
            { icon: ArrowRightIcon, label: "Правее", off: index === total - 1, run: () => update.mutate({ id: moment.id, position: index + 1 }) },
            { icon: PencilIcon, label: "Подпись", off: false, run: () => setEditing(true) },
            {
              icon: Trash2Icon,
              label: "Убрать",
              off: false,
              run: () => remove.mutate(moment.id, { onSuccess: () => toast.success("Момент убран") }),
            },
          ].map(({ icon: Icon, label, off, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              disabled={off || update.isPending || remove.isPending}
              onClick={run}
              className={cn("grid size-7 place-items-center rounded-md transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-30", label === "Убрать" && "hover:text-rose-400")}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
