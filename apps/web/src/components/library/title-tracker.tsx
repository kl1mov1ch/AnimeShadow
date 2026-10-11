import type { AnimeSummary, LibraryStatus } from "@animeshadow/shared";
import { BookmarkIcon, LockIcon, NotebookPenIcon, StarIcon, Trash2Icon } from "lucide-react";
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
import { STATUSES, STATUS_META } from "./library-meta";
import { useLibraryEdit } from "./use-library-edit";

/** The chosen status's fill — real colour values, so the change transitions. */
const STATUS_COLOR: Record<LibraryStatus, string> = {
  WATCHING: "#10b981",
  PLANNED: "#0ea5e9",
  COMPLETED: "var(--primary)",
  ON_HOLD: "#f59e0b",
  DROPPED: "#f43f5e",
};

/** The card both blocks under the player are drawn in (see WatchTimeCard). */
export const TRACK_CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-4";
export const TRACK_HEAD =
  "flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/**
 * "My list" on the title page: where the title stands for this viewer, their
 * score, and a private note — each control with its name written on it, so
 * someone who has never seen the site knows what a tap will do. It used to
 * be a row of five unlabelled coloured icons and ten small stars, which
 * explained itself only to people who already knew it.
 */
export function TitleTracker({ anime, title, className }: { anime: AnimeSummary; title: string; className?: string }) {
  const t = useT();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";
  const { data: entries } = useLibrary(undefined, isAuthed);
  const upsert = useUpsertLibraryEntry();
  const edit = useLibraryEdit();
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [popped, setPopped] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const entry = entries?.find((e) => e.anime.id === anime.id);

  if (authStatus === "loading") {
    return <div className={cn(TRACK_CARD, "h-44 animate-pulse", className)} />;
  }

  if (!isAuthed) {
    return (
      <section className={cn(TRACK_CARD, className)}>
        <h3 className={TRACK_HEAD}>
          <BookmarkIcon />
          {t("library.tracker.myList")}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("library.tracker.signInBody")}</p>
        <Button asChild className="w-full sm:w-fit">
          <Link to="/login" state={{ from: window.location.pathname }}>
            {t("common.signIn")}
          </Link>
        </Button>
      </section>
    );
  }

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

  return (
    <section className={cn(TRACK_CARD, className)} aria-label={t("library.tracker.myList")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={TRACK_HEAD}>
          <BookmarkIcon />
          {t("library.tracker.myList")}
        </h3>
        {entry && (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            aria-label={t("library.removeFromLibrary", { title })}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2Icon className="size-3.5" />
            {t("library.removeShort")}
          </button>
        )}
      </div>

      {/* Where it stands: five named buttons, the chosen one filled. */}
      <div role="radiogroup" aria-label={t("library.watchStatus")} className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
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
              style={active ? { backgroundColor: STATUS_COLOR[s] } : undefined}
              className={cn(
                "inline-flex h-10 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-[13px] font-medium transition-[background-color,border-color,color] duration-200 active:scale-[0.97] max-[359px]:gap-1.5 max-[359px]:text-xs sm:h-9 sm:gap-1.5",
                active
                  ? cn("border-transparent", s === "COMPLETED" ? "text-primary-foreground" : "text-white")
                  : "border-border/70 bg-background/40 text-foreground/80 hover:border-foreground/25 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", !active && text)} />
              <span className="truncate">{t(`status.${s}`)}</span>
            </button>
          );
        })}
      </div>

      {/* The score: ten stars across the card, big enough for a thumb,
          with what the one under the finger or cursor means. */}
      <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-muted-foreground">{t("library.tracker.rate")}</span>
          {shownScore != null ? (
            <span key={shownScore} className="animate-in fade-in-0">
              <span className="font-semibold tabular-nums text-amber-400">{shownScore}</span>
              <span className="text-muted-foreground"> · {t(`library.tracker.r${shownScore}`)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/70">{t("library.tracker.rateTap")}</span>
          )}
        </div>
        <div
          role="radiogroup"
          aria-label={t("library.tracker.rate")}
          onPointerLeave={() => setHoverScore(null)}
          className="grid max-w-[26rem] grid-cols-10 gap-0.5"
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
                onPointerEnter={(event) => event.pointerType === "mouse" && setHoverScore(value)}
                onFocus={() => setHoverScore(value)}
                onBlur={() => setHoverScore(null)}
                onClick={() => chooseScore(value)}
                onAnimationEnd={() => value === popped && setPopped(null)}
                className={cn(
                  "grid aspect-square max-h-10 place-items-center rounded-md transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                  popped != null && value <= popped && "star-pop",
                )}
                style={popped != null ? { animationDelay: `${i * 25}ms` } : undefined}
              >
                <StarIcon
                  className={cn(
                    "size-[22px] transition-colors duration-150",
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
      </div>

      {entry && <NoteButton note={entry.notes} onSave={(notes) => edit.setNotes(entry, notes)} />}

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
    </section>
  );
}

/**
 * The note as a button that shows its first words, so there visibly is one;
 * a dashed one inviting one otherwise. Edits in a popover.
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
            "inline-flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-3 text-left text-xs transition-colors duration-200 sm:w-fit sm:max-w-full",
            note
              ? "border-border/70 bg-foreground/[0.05] text-foreground"
              : "border-dashed border-border/80 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
          )}
        >
          <NotebookPenIcon className="size-3.5 shrink-0" />
          <span className="truncate">{note ?? t("library.tracker.noteTitle")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2">
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
          className="w-full resize-y rounded-lg border border-border/60 bg-transparent p-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:border-foreground/30"
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
