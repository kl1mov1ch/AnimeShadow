import type { AnimeSummary, LibraryStatus } from "@animeshadow/shared";
import {
  BookmarkPlusIcon,
  LockIcon,
  NotebookPenIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { DrawnCheck } from "@/components/ui/morph-icon";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_META } from "./library-meta";
import { useLibraryEdit } from "./use-library-edit";

/** The chosen status's text/icon colour — the fill itself now lives on the
 *  one sliding highlight behind the buttons, not on each button. */
const CHIP_ON: Record<LibraryStatus, string> = {
  WATCHING: "text-white",
  PLANNED: "text-white",
  COMPLETED: "text-primary-foreground",
  ON_HOLD: "text-white",
  DROPPED: "text-white",
};

/** Real colour values, not Tailwind classes — the highlight below animates
 *  `background-color` directly, and a class swap never transitions that. */
const STATUS_COLOR: Record<LibraryStatus, string> = {
  WATCHING: "#10b981",
  PLANNED: "#0ea5e9",
  COMPLETED: "var(--primary)",
  ON_HOLD: "#f59e0b",
  DROPPED: "#f43f5e",
};

/**
 * The title page's tracking bar: status, score and note in one
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
  const entry = entries?.find((e) => e.anime.id === anime.id);
  const activeStatus = entry?.status ?? null;

  // The fill used to be a class swapped straight onto whichever button was
  // active — correct the instant you clicked, but a jump cut, not a change
  // you could see happen. It is one element now, absolutely positioned
  // behind the row, that slides to the new button's spot and crosses to its
  // colour while it travels; the buttons themselves only ever swap a text
  // colour, which *does* transition on its own.
  //
  // Declared above every early return below — hooks can't be conditional —
  // even though the row it measures only exists once someone is signed in.
  const statusRowRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const row = statusRowRef.current;
    if (!row || !activeStatus) {
      setHighlight(null);
      return;
    }
    const measure = () => {
      const btn = row.querySelector<HTMLButtonElement>(`[data-status="${activeStatus}"]`);
      if (btn) setHighlight({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    // The active button grows a text label that isn't there on any other
    // button, so its width can change with the viewport (icon sizes, font)
    // even though `activeStatus` itself hasn't.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeStatus]);

  if (authStatus === "loading") {
    return <div className="h-9 w-full max-w-md animate-pulse rounded-full bg-muted/60" />;
  }

  if (!isAuthed) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <BookmarkPlusIcon className="size-4 shrink-0 text-[var(--accent-ink)]" />
        <span className="text-sm text-muted-foreground">{t("library.tracker.signInBody")}</span>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/login" state={{ from: window.location.pathname }}>
            {t("common.signIn")}
          </Link>
        </Button>
      </div>
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
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      {/* Status: one segmented pill. The chosen one fills and names itself;
          the rest are icons with their names on hover, to keep it to one line. */}
      <div
        ref={statusRowRef}
        role="radiogroup"
        aria-label={t("library.watchStatus")}
        className="relative flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 p-0.5 backdrop-blur-sm"
      >
        {highlight && (
          <span
            aria-hidden
            className="absolute inset-y-0.5 rounded-full shadow-md transition-[left,width,background-color] duration-300 ease-out"
            style={{
              left: highlight.left,
              width: highlight.width,
              backgroundColor: activeStatus ? STATUS_COLOR[activeStatus] : undefined,
            }}
          />
        )}
        {STATUSES.map((s) => {
          const { Icon, text } = STATUS_META[s];
          const active = entry?.status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              data-status={s}
              onClick={() => chooseStatus(s)}
              disabled={upsert.isPending}
              title={t(`status.${s}`)}
              className={cn(
                "group relative z-10 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors duration-200 active:scale-95",
                active ? CHIP_ON[s] : "text-foreground/75 hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-transform duration-300 group-hover:scale-110",
                  // Picking a status is a commitment, so the icon lands with
                  // a pop rather than simply being the icon that is there.
                  active ? "morph-pop" : text,
                )}
              />
              {active && (
                <>
                  <span>{t(`status.${s}`)}</span>
                  {/* Re-keyed on the status so the stroke redraws every time
                      the choice changes — it is the answer to the click, not
                      a badge that happens to be present. */}
                  <DrawnCheck key={s} className="size-3.5 shrink-0" />
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Score: ten stars, and a word for the one under the cursor. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
                  "grid size-[22px] place-items-center rounded transition-transform sm:size-6 duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
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
        {/* Fixed width from sm up, so the row does not shift as the word
            changes. Below sm there's no room to spare — the word
            ("отлично", "шедевр"…) is exactly what was running past the
            edge of the bar, so a phone gets the number alone, and a
            `max-w`/`truncate` safety net in case even that doesn't fit
            next to a long status label. */}
        <span className="max-w-[11ch] truncate text-xs sm:max-w-none sm:w-28">
          {shownScore != null ? (
            <span key={shownScore} className="animate-in fade-in font-semibold text-amber-500">
              {shownScore}
              <span className="hidden sm:inline"> · {t(`library.tracker.r${shownScore}`)}</span>
            </span>
          ) : (
            <span className="hidden text-muted-foreground/60 sm:inline">
              {t("library.tracker.rateHint")}
            </span>
          )}
        </span>
      </div>

      {entry && <NoteButton note={entry.notes} onSave={(notes) => edit.setNotes(entry, notes)} />}

      {entry && (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          aria-label={t("library.removeFromLibrary", { title })}
          title={t("library.removeShort")}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
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
            "group inline-flex h-9 max-w-52 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all duration-200 hover:-translate-y-0.5",
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
