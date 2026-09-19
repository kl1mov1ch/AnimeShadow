import type { AnimeSummary, LibraryStatus } from "@animeshadow/shared";
import {
  BookmarkPlusIcon,
  LockIcon,
  MinusIcon,
  NotebookPenIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";
import { EpisodeInput } from "./library-parts";
import { STATUSES, STATUS_META } from "./library-meta";
import { useLibraryEdit } from "./use-library-edit";

/** The chosen status, painted in its own colour. */
const CHIP_ON: Record<LibraryStatus, string> = {
  WATCHING: "bg-emerald-500 text-white shadow-emerald-500/30",
  PLANNED: "bg-sky-500 text-white shadow-sky-500/30",
  COMPLETED: "bg-primary text-primary-foreground shadow-primary/30",
  ON_HOLD: "bg-amber-500 text-white shadow-amber-500/30",
  DROPPED: "bg-rose-500 text-white shadow-rose-500/30",
};

/**
 * The title page's tracking bar: status, score, episode and note in one
 * row. Each answers visibly when used — the chosen status fills with its
 * colour and names itself, stars light under the cursor and say what the
 * score means, the note shows its first words — without the bar growing
 * taller than one line of controls.
 *
 * Lives above the player on the title page, where watching happens.
 */
export function TitleTracker({ anime, title }: { anime: AnimeSummary; title: string }) {
  const t = useT();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";
  const { data: entries } = useLibrary(undefined, isAuthed);
  const upsert = useUpsertLibraryEntry();
  const edit = useLibraryEdit();
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [popped, setPopped] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (authStatus === "loading") {
    return <div className="h-9 w-full max-w-md animate-pulse rounded-full bg-muted/60" />;
  }

  if (!isAuthed) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <BookmarkPlusIcon className="size-4 shrink-0 text-[var(--accent-ink)]" />
        <span className="text-sm text-muted-foreground">{t("library.tracker.signInBody")}</span>
        <Button asChild size="sm" className="shrink-0 rounded-full">
          <Link to="/login" state={{ from: window.location.pathname }}>
            {t("common.signIn")}
          </Link>
        </Button>
      </div>
    );
  }

  const entry = entries?.find((e) => e.anime.id === anime.id);
  const fail = (error: unknown) =>
    toast.error(error instanceof ApiRequestError ? error.message : t("library.saveError"));

  const chooseStatus = (status: LibraryStatus) => {
    if (entry) {
      if (entry.status !== status) edit.setStatus(entry, status);
      return;
    }
    upsert.mutate(
      { animeId: anime.id, input: { status, score: null, notes: null } },
      {
        onSuccess: () => toast.success(t("library.savedStatus", { title, status: t(`status.${status}`) })),
        onError: fail,
      },
    );
  };

  const chooseScore = (score: number) => {
    setPopped(score);
    if (entry) {
      // The same star again takes the score back off.
      edit.setScore(entry, entry.score === score ? null : score);
      return;
    }
    // Scoring something is saying you have seen it.
    upsert.mutate(
      {
        animeId: anime.id,
        input: { status: "COMPLETED", score, progress: anime.episodes ?? undefined, notes: null },
      },
      {
        onSuccess: () => toast.success(t("library.tracker.ratedAndAdded", { score, title })),
        onError: fail,
      },
    );
  };

  const shownScore = hoverScore ?? entry?.score ?? null;
  const total = anime.episodes ?? 0;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {/* Status: one segmented pill. The chosen one fills and names itself;
          the rest are icons with their names on hover, to keep it to one line. */}
      <div
        role="radiogroup"
        aria-label={t("library.watchStatus")}
        className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5 backdrop-blur-sm"
      >
        {STATUSES.map((s) => {
          const { Icon, text } = STATUS_META[s];
          const active = entry?.status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseStatus(s)}
              disabled={upsert.isPending}
              title={t(`status.${s}`)}
              className={cn(
                "group inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-all duration-200 active:scale-95",
                active ? cn("shadow-md", CHIP_ON[s]) : "text-foreground/75 hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform group-hover:scale-110",
                  active ? "animate-in zoom-in-50" : text,
                )}
              />
              {active && <span>{t(`status.${s}`)}</span>}
            </button>
          );
        })}
      </div>

      {/* Score: ten stars, and a word for the one under the cursor. */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex items-center"
          onPointerLeave={() => setHoverScore(null)}
          role="radiogroup"
          aria-label={t("library.tracker.rate")}
        >
          {Array.from({ length: 10 }, (_, i) => {
            const value = i + 1;
            const lit = shownScore != null && value <= shownScore;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={entry?.score === value}
                aria-label={`${value} — ${t(`library.tracker.r${value}`)}`}
                onPointerEnter={() => setHoverScore(value)}
                onFocus={() => setHoverScore(value)}
                onBlur={() => setHoverScore(null)}
                onClick={() => chooseScore(value)}
                onAnimationEnd={() => value === popped && setPopped(null)}
                className={cn(
                  "grid size-6 place-items-center rounded transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                  popped != null && value <= popped && "star-pop",
                )}
                style={popped != null ? { animationDelay: `${i * 25}ms` } : undefined}
              >
                <StarIcon
                  className={cn(
                    "size-4 transition-colors duration-150",
                    lit
                      ? hoverScore != null && entry?.score !== hoverScore
                        ? "fill-amber-400/70 text-amber-400/70"
                        : "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/35",
                  )}
                />
              </button>
            );
          })}
        </div>
        {/* Fixed width, so the row does not shift as the word changes. */}
        <span className="w-28 truncate text-xs">
          {shownScore != null ? (
            <span key={shownScore} className="animate-in fade-in font-semibold text-amber-500">
              {shownScore} · {t(`library.tracker.r${shownScore}`)}
            </span>
          ) : (
            <span className="text-muted-foreground/60">{t("library.tracker.rateHint")}</span>
          )}
        </span>
      </div>

      {entry && anime.type !== "MOVIE" && (
        <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-0.5">
          <button
            type="button"
            onClick={() => edit.step(entry, -1)}
            disabled={entry.progress <= 0}
            aria-label={t("library.minusOne")}
            title={t("library.minusOne")}
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <span className="min-w-14 text-center text-xs tabular-nums text-muted-foreground">
            {t("library.tracker.episode")}{" "}
            <EpisodeInput entry={entry} edit={edit} />
            {total > 0 && `/${total}`}
          </span>
          <button
            type="button"
            onClick={() => edit.step(entry, 1)}
            disabled={total > 0 && entry.progress >= total}
            aria-label={t("library.plusOne")}
            title={t("library.plusOne")}
            className="grid size-7 place-items-center rounded-full bg-[var(--accent-ink)] text-background transition-transform hover:scale-110 active:scale-90 disabled:opacity-30"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      )}

      {entry && <NoteButton note={entry.notes} onSave={(notes) => edit.setNotes(entry, notes)} />}

      {entry && (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={t("library.removeFromLibrary", { title })}
          title={t("library.removeShort")}
          className="grid size-8 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("library.confirmRemoveTitle", { title })}
        pending={edit.removing}
        onConfirm={() => {
          if (entry) edit.remove(entry);
          setConfirmRemove(false);
        }}
      />
    </div>
  );
}

/**
 * The note as a pill that shows its first words, so there visibly is one;
 * a dashed pill inviting one otherwise. Edits in a popover.
 */
function NoteButton({ note, onSave }: { note: string | null; onSave: (notes: string | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const save = () => {
    const next = draft.trim() || null;
    if (next !== note) onSave(next);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(note ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex h-9 max-w-52 items-center gap-1.5 rounded-full border px-3 text-xs transition-all duration-200 hover:-translate-y-0.5",
            note
              ? "border-[var(--accent-line)] bg-[var(--accent-surface-strong)] text-foreground"
              : "border-dashed border-border/80 text-muted-foreground hover:border-[var(--accent-line)] hover:text-foreground",
          )}
        >
          <NotebookPenIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform group-hover:-rotate-12",
              note && "text-[var(--accent-ink)]",
            )}
          />
          <span className="truncate">{note ?? t("library.tracker.noteTitle")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <LockIcon className="size-3" />
          {t("library.tracker.noteTitle")} · {t("library.tracker.notePrivate")}
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          }}
          rows={4}
          maxLength={2000}
          autoFocus
          placeholder={t("library.tracker.noteEmpty")}
          className="w-full resize-y rounded-lg border border-border/60 bg-transparent p-2 text-sm leading-relaxed outline-none focus-visible:border-[var(--accent-line)] placeholder:text-muted-foreground/60"
        />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">{t("library.tracker.noteSaveHint")}</span>
          <span className="ml-auto tabular-nums">{draft.length}/2000</span>
          <Button size="sm" className="h-7" onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
