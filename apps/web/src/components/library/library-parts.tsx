import type { LibraryEntry, LibraryStatus } from "@animeshadow/shared";
import {
  MinusIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { STATUSES, STATUS_META, progressPercent } from "./library-meta";
import type { LibraryEdit } from "./use-library-edit";

const SCORE_OPTIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export function ProgressLine({ entry, className }: { entry: LibraryEntry; className?: string }) {
  const percent = progressPercent(entry);
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-foreground/10", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", STATUS_META[entry.status].bar)}
        // Unknown length: a sliver for anything started, so "watching" never
        // looks identical to "not started".
        style={{ width: `${percent ?? (entry.progress > 0 ? 8 : 0)}%` }}
      />
    </div>
  );
}

/**
 * The episode counter: "−", the count over the total — the box itself fills
 * with the status colour as far as the title is watched — and a big "+1",
 * the one tapped most. Tap the count to type a number.
 */
export function ProgressStepper({
  entry,
  edit,
  className,
  compact = false,
}: {
  entry: LibraryEntry;
  edit: LibraryEdit;
  className?: string;
  /** A narrow card on a phone: no "−" (typing the number covers it). */
  compact?: boolean;
}) {
  const t = useT();
  const total = entry.anime.episodes ?? 0;
  const done = total > 0 && entry.progress >= total;
  // Unknown length: a sliver for anything started, so "watching" never
  // looks identical to "not started".
  const percent = progressPercent(entry) ?? (entry.progress > 0 ? 8 : 0);
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => edit.step(entry, -1)}
        disabled={entry.progress <= 0}
        aria-label={t("library.minusOne")}
        title={t("library.minusOne")}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
          compact && "max-sm:hidden",
        )}
      >
        <MinusIcon className="size-3.5" />
      </button>
      <div className="relative flex h-8 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.06] text-xs tabular-nums">
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 opacity-35 transition-[width] duration-500", STATUS_META[entry.status].bar)}
          style={{ width: `${percent}%` }}
        />
        <span className="relative truncate px-1">
          <EpisodeInput entry={entry} edit={edit} />
          <span className="text-muted-foreground">/{total > 0 ? total : "?"}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => edit.step(entry, 1)}
        disabled={done}
        aria-label={t("library.plusOne")}
        title={t("library.plusOne")}
        className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
      >
        <PlusIcon className="size-3.5" />1
      </button>
    </div>
  );
}

/**
 * The watched-episode count, typed rather than clicked: tap the number, type
 * any value, Enter (or tapping away) saves it, Escape backs out. For jumping
 * a dozen episodes at once, where "+1" twelve times is a chore.
 */
export function EpisodeInput({
  entry,
  edit,
  className,
}: {
  entry: LibraryEntry;
  edit: LibraryEdit;
  className?: string;
}) {
  const t = useT();
  const total = entry.anime.episodes ?? 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const value = Number.parseInt(draft, 10);
    if (Number.isFinite(value)) edit.setProgress(entry, value);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(entry.progress));
          setEditing(true);
        }}
        title={t("library.editEpisodes")}
        aria-label={t("library.editEpisodes")}
        className={cn(
          "rounded px-0.5 font-semibold text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 transition-colors hover:bg-secondary hover:decoration-foreground",
          className,
        )}
      >
        {entry.progress}
      </button>
    );
  }

  return (
    <input
      ref={input}
      type="number"
      inputMode="numeric"
      min={0}
      max={total > 0 ? total : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={t("library.editEpisodes")}
      className={cn(
        "w-[4.5ch] rounded border border-primary/60 bg-background px-0.5 text-center font-semibold text-foreground outline-none ring-2 ring-primary/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
    />
  );
}

export function UserScore({ score, className }: { score: number | null; className?: string }) {
  if (score == null) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", className)}>
      <StarIcon className="size-3 fill-amber-400 text-amber-400" />
      {score}
    </span>
  );
}

/**
 * Everything else about an entry — status, score, note, removal — behind one
 * "…" so the card itself stays small.
 */
export function EntryMenu({
  entry,
  edit,
  className,
}: {
  entry: LibraryEntry;
  edit: LibraryEdit;
  className?: string;
}) {
  const t = useT();
  const labels = useLabels();
  const title = labels.title(entry.anime);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("library.actions")}
            className={cn(
              "flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground",
              className,
            )}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuRadioGroup
            value={entry.status}
            onValueChange={(v) => edit.setStatus(entry, v as LibraryStatus)}
          >
            {STATUSES.map((s) => {
              const { Icon, text } = STATUS_META[s];
              return (
                <DropdownMenuRadioItem key={s} value={s}>
                  <Icon className={cn("size-4", text)} />
                  {t(`status.${s}`)}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <StarIcon className="size-4" />
              {t("library.setScore")}
              {entry.score != null && (
                <span className="ml-auto tabular-nums text-muted-foreground">{entry.score}</span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={entry.score == null ? "none" : String(entry.score)}
                onValueChange={(v) => edit.setScore(entry, v === "none" ? null : Number(v))}
              >
                {SCORE_OPTIONS.map((v) => (
                  <DropdownMenuRadioItem key={v} value={String(v)}>
                    {t("library.scoreValue", { value: v })}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem value="none">{t("library.noScore")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onSelect={() => {
              setDraft(entry.notes ?? "");
              setNoteOpen(true);
            }}
          >
            <NotebookPenIcon className="size-4" />
            {t("library.editNote")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
            <Trash2Icon className="size-4" />
            {t("library.removeShort")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="line-clamp-2">{title}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder={t("library.notesPlaceholder")}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                edit.setNotes(entry, draft.trim() || null);
                setNoteOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("library.confirmRemoveTitle", { title })}
        pending={edit.removing}
        onConfirm={() => {
          edit.remove(entry);
          setConfirmRemove(false);
        }}
      />
    </>
  );
}
