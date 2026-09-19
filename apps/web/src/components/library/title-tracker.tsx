import type { AnimeSummary, LibraryStatus } from "@animeshadow/shared";
import {
  BookmarkPlusIcon,
  CheckIcon,
  LockIcon,
  MinusIcon,
  NotebookPenIcon,
  PlusIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_META, progressPercent } from "./library-meta";
import { useLibraryEdit } from "./use-library-edit";

/**
 * Filled-chip colours per status. Kept beside STATUS_META rather than in it
 * because only this panel paints a whole button in the colour.
 */
const CHIP_ON: Record<LibraryStatus, string> = {
  WATCHING: "border-emerald-500 bg-emerald-500 text-white shadow-emerald-500/30",
  PLANNED: "border-sky-500 bg-sky-500 text-white shadow-sky-500/30",
  COMPLETED: "border-primary bg-primary text-primary-foreground shadow-primary/30",
  ON_HOLD: "border-amber-500 bg-amber-500 text-white shadow-amber-500/30",
  DROPPED: "border-rose-500 bg-rose-500 text-white shadow-rose-500/30",
};

/**
 * The title page's own tracking panel: status, score, episode and note, each
 * one click away and each answering visibly when used — a chip that fills
 * with its colour, stars that light up under the cursor and name the score,
 * a note that reads as a note rather than as an icon.
 *
 * The compact LibraryControls stays for tight places like the hero slider.
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
    return <div className="h-36 w-full max-w-xl animate-pulse rounded-2xl bg-muted/60" />;
  }

  if (!isAuthed) {
    return (
      <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-surface-strong)] text-[var(--accent-ink)]">
          <BookmarkPlusIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("library.tracker.signInTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("library.tracker.signInBody")}</p>
        </div>
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
  const percent = entry ? progressPercent(entry) : null;

  return (
    <div className="relative flex w-full max-w-xl flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:p-4">
      {/* A soft glow in the current status's colour — the panel itself says
          where this title sits in your list. */}
      {entry && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-20 blur-2xl transition-colors duration-500",
            STATUS_META[entry.status].dot,
          )}
        />
      )}

      <div className="relative flex items-center gap-2">
        {entry ? (
          <>
            <span className={cn("size-2 rounded-full", STATUS_META[entry.status].dot)} />
            <span className="text-xs font-medium text-muted-foreground">{t(`status.${entry.status}`)}</span>
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              aria-label={t("library.removeFromLibrary", { title })}
              title={t("library.removeShort")}
              className="ml-auto grid size-7 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <SparklesIcon className="size-4 animate-pulse text-[var(--accent-ink)]" />
            <span className="text-sm font-medium">{t("library.tracker.prompt")}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              · {t("library.tracker.promptHint")}
            </span>
          </>
        )}
      </div>

      {/* Status: every option visible, one click each. */}
      <div className="relative flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const { Icon, text } = STATUS_META[s];
          const active = entry?.status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => chooseStatus(s)}
              disabled={upsert.isPending}
              aria-pressed={active}
              className={cn(
                "group inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all duration-200 active:scale-95",
                active
                  ? cn("shadow-lg", CHIP_ON[s])
                  : "border-border/60 bg-card/60 text-foreground/80 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-card",
              )}
            >
              {active ? (
                <CheckIcon key="on" className="animate-in zoom-in-50 size-3.5" />
              ) : (
                <Icon className={cn("size-3.5 transition-transform group-hover:scale-110", text)} />
              )}
              {t(`status.${s}`)}
            </button>
          );
        })}
      </div>

      <div className="relative grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        {/* Score: ten stars that light up under the cursor, with a word for
            the score so a 6 and a 9 feel different before you commit. */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="font-medium text-muted-foreground">{t("library.tracker.rate")}</span>
            {shownScore != null ? (
              <span key={shownScore} className="animate-in fade-in font-semibold text-amber-500">
                {shownScore} · {t(`library.tracker.r${shownScore}`)}
              </span>
            ) : (
              <span className="text-muted-foreground/60">{t("library.tracker.rateHint")}</span>
            )}
          </div>
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
                    "grid size-7 place-items-center rounded-md transition-transform duration-150 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                    popped != null && value <= popped && "star-pop",
                  )}
                  style={popped != null ? { animationDelay: `${i * 25}ms` } : undefined}
                >
                  <StarIcon
                    className={cn(
                      "size-5 transition-colors duration-150",
                      lit
                        ? hoverScore != null && entry?.score !== hoverScore
                          ? "fill-amber-400/70 text-amber-400/70"
                          : "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30",
                    )}
                  />
                </button>
              );
            })}
            {entry?.score != null && (
              <button
                type="button"
                onClick={() => edit.setScore(entry, null)}
                aria-label={t("library.tracker.clearScore")}
                title={t("library.tracker.clearScore")}
                className="ml-1 grid size-6 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Episode counter, once there is something to count. */}
        {entry && anime.type !== "MOVIE" && (
          <div className="flex flex-col gap-1.5 sm:min-w-40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t("library.tracker.episode")}{" "}
                <span className="font-display text-base tabular-nums text-foreground">{entry.progress}</span>
                {total > 0 && <span className="tabular-nums"> {t("library.tracker.of", { total })}</span>}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => edit.step(entry, -1)}
                  disabled={entry.progress <= 0}
                  aria-label={t("library.minusOne")}
                  className="grid size-7 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <MinusIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => edit.step(entry, 1)}
                  disabled={total > 0 && entry.progress >= total}
                  aria-label={t("library.plusOne")}
                  className="grid size-8 place-items-center rounded-full bg-[var(--accent-ink)] text-background shadow-md transition-transform hover:scale-110 active:scale-90 disabled:opacity-30"
                >
                  <PlusIcon className="size-4" />
                </button>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", STATUS_META[entry.status].bar)}
                style={{ width: `${percent ?? (entry.progress > 0 ? 8 : 0)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {entry && <NoteCard note={entry.notes} onSave={(notes) => edit.setNotes(entry, notes)} />}

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
 * The note as a card: shows what it says, opens in place to edit. An icon
 * button hid it — nobody knew there was a note, or that one could be left.
 */
function NoteCard({ note, onSave }: { note: string | null; onSave: (notes: string | null) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const open = () => {
    setDraft(note ?? "");
    setEditing(true);
  };
  const save = () => {
    const next = draft.trim() || null;
    if (next !== note) onSave(next);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          "group relative flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200",
          note
            ? "border-[var(--accent-line-soft)] bg-card/60 hover:border-[var(--accent-line)]"
            : "border-dashed border-border/70 bg-transparent hover:border-[var(--accent-line)] hover:bg-card/40",
        )}
      >
        <NotebookPenIcon
          className={cn(
            "mt-0.5 size-4 shrink-0 transition-transform duration-200 group-hover:-rotate-12",
            note ? "text-[var(--accent-ink)]" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("library.tracker.noteTitle")}
            <LockIcon className="size-2.5" aria-label={t("library.tracker.notePrivate")} />
          </span>
          <span
            className={cn(
              "mt-0.5 block text-sm leading-snug",
              note ? "line-clamp-2 whitespace-pre-line" : "text-muted-foreground/70",
            )}
          >
            {note ?? t("library.tracker.noteEmpty")}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-2 rounded-xl border border-[var(--accent-line)] bg-card/80 p-2.5">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
          if (e.key === "Escape") setEditing(false);
        }}
        rows={3}
        maxLength={2000}
        autoFocus
        placeholder={t("library.tracker.noteEmpty")}
        className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <LockIcon className="size-3" />
        <span className="hidden sm:inline">{t("library.tracker.notePrivate")} · {t("library.tracker.noteSaveHint")}</span>
        <span className="ml-auto tabular-nums">{draft.length}/2000</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" className="h-7" onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
