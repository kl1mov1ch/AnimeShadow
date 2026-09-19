import type { LibraryEntry, LibraryStatus } from "@animeshadow/shared";
import {
  MinusIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
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
import { STATUSES, STATUS_META, progressLabel, progressPercent } from "./library-meta";
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

/** −1 / count / +1. The count itself is the progress label. */
export function ProgressStepper({
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
  const done = total > 0 && entry.progress >= total;
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button
        type="button"
        onClick={() => edit.step(entry, -1)}
        disabled={entry.progress <= 0}
        aria-label={t("library.minusOne")}
        title={t("library.minusOne")}
        className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <MinusIcon className="size-3" />
      </button>
      <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground">
        {progressLabel(entry)}
      </span>
      <button
        type="button"
        onClick={() => edit.step(entry, 1)}
        disabled={done}
        aria-label={t("library.plusOne")}
        title={t("library.plusOne")}
        className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary transition-all hover:bg-primary hover:text-primary-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-30"
      >
        <PlusIcon className="size-3" />
      </button>
    </div>
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
              "flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground",
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
