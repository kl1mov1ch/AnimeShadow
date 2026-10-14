import type { AnimeSummary } from "@animeshadow/shared";
import { Loader2Icon, PlayIcon, SearchIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useContinueWatching, useSmartSearch } from "@/lib/query";
import { cn } from "@/lib/utils";

type PartyPick = { anime: Pick<AnimeSummary, "id" | "title" | "titleLocalized" | "imageUrl" | "year" | "type" | "episodes">; episode: number };

/**
 * "Что смотрим вместе?": a search over the catalogue and what you're in the
 * middle of, one tap to choose. Used to start a room (from the header) and
 * to switch the room to another title (inside it). Episodes are picked in
 * the room itself.
 */
export function PartyPicker({
  open,
  onOpenChange,
  title = "Совместный просмотр",
  hint = "Выберите аниме — серию выберете в комнате. Пригласите до 9 друзей по ссылке.",
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  hint?: string;
  onPick: (pick: PartyPick) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const term = useDebouncedValue(q.trim());
  const search = useSmartSearch(term, open && term.length >= 2);
  const { data: cont } = useContinueWatching(open);
  const [busy, setBusy] = useState<number | null>(null);

  const results: PartyPick[] =
    term.length >= 2
      ? (search.data?.flat ?? []).slice(0, 12).map((anime) => ({ anime, episode: 1 }))
      : (cont?.items ?? []).slice(0, 8).map((i) => ({ anime: i.anime, episode: i.episode }));

  const choose = async (p: PartyPick) => {
    setBusy(p.anime.id);
    try {
      await onPick(p);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex flex-col gap-3 border-b border-border/60 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <UsersIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-display text-lg leading-tight">{title}</DialogTitle>
              <DialogDescription className="text-xs">{hint}</DialogDescription>
            </div>
          </div>
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название аниме…"
              className="h-11 w-full rounded-xl border border-[var(--accent-line-soft)] bg-background/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {term.length >= 2 ? (search.isFetching ? "Ищем…" : "Найдено") : "Вы сейчас смотрите"}
          </p>
          {results.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {term.length >= 2 ? (search.isFetching ? "" : "Ничего не нашлось") : "Начните вводить название"}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((p) => (
                <li key={p.anime.id}>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => void choose(p)}
                    className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-foreground/[0.06] disabled:opacity-60"
                  >
                    <span className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {p.anime.imageUrl && <img src={imageSrc(p.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.anime.titleLocalized || p.anime.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[p.anime.year, p.anime.episodes ? `${p.anime.episodes} эп.` : null].filter(Boolean).join(" · ")}
                        {term.length < 2 && ` · вы на ${p.episode} серии`}
                      </span>
                    </span>
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110")}>
                      {busy === p.anime.id ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4 translate-x-px fill-current" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The header's "Смотреть вместе": opens the picker, makes the room, goes there. */
export function usePartyStarter() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const start = () => {
    if (status !== "authenticated") {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    setOpen(true);
  };
  const picker = (
    <PartyPicker
      open={open}
      onOpenChange={setOpen}
      onPick={async ({ anime, episode }) => {
        try {
          const { code } = await apiRequest<{ code: string }>("/party", { method: "POST", body: { animeId: anime.id, episode } });
          setOpen(false);
          navigate(`/party/${code}`);
        } catch {
          toast.error("Не получилось создать комнату");
        }
      }}
    />
  );
  return { start, picker };
}
