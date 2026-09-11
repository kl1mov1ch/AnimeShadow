import { type LibraryStatus, libraryStatusSchema } from "@animeshadow/shared";
import { BookmarkPlusIcon, NotebookPenIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import {
  useLibrary,
  useRemoveLibraryEntry,
  useUpsertLibraryEntry,
} from "@/lib/query";

const STATUS_OPTIONS = libraryStatusSchema.options;
const SCORE_OPTIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const NO_SCORE = "none";

interface LibraryControlsProps {
  animeId: number;
  title: string;
}

export function LibraryControls({ animeId, title }: LibraryControlsProps) {
  const t = useT();
  const { status: authStatus } = useAuth();
  const isAuthed = authStatus === "authenticated";

  const { data: entries } = useLibrary(undefined, isAuthed);
  const upsert = useUpsertLibraryEntry();
  const remove = useRemoveLibraryEntry();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const entry = entries?.find((item) => item.anime.id === animeId);

  if (authStatus === "loading") {
    return <div className="h-10 w-full max-w-sm animate-pulse rounded-md bg-muted" />;
  }

  if (!isAuthed) {
    return (
      <Button asChild variant="secondary">
        <Link to="/login" state={{ from: window.location.pathname }}>
          <BookmarkPlusIcon data-icon="inline-start" />
          {t("library.signInToTrack")}
        </Link>
      </Button>
    );
  }

  const messageFor = (error: unknown): string =>
    error instanceof ApiRequestError ? error.message : t("library.saveError");

  const handleStatus = (next: LibraryStatus) => {
    upsert.mutate(
      {
        animeId,
        input: {
          status: next,
          score: entry?.score ?? null,
          notes: entry?.notes ?? null,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            t("library.savedStatus", { title, status: t(`status.${next}`) }),
          ),
        onError: (error) => toast.error(messageFor(error)),
      },
    );
  };

  const handleScore = (value: string) => {
    if (!entry) return;
    upsert.mutate(
      {
        animeId,
        input: {
          status: entry.status,
          score: value === NO_SCORE ? null : Number(value),
          notes: entry.notes,
        },
      },
      { onError: (error) => toast.error(messageFor(error)) },
    );
  };

  const handleNotes = (notes: string) => {
    if (!entry) return;
    upsert.mutate(
      { animeId, input: { status: entry.status, score: entry.score, notes: notes || null } },
      {
        onSuccess: () => toast.success(t("library.notesSaved")),
        onError: (error) => toast.error(messageFor(error)),
      },
    );
  };

  const handleRemove = () => {
    remove.mutate(animeId, {
      onSuccess: () => toast.success(t("library.removed", { title })),
      onError: (error) => toast.error(messageFor(error)),
    });
  };

  const busy = upsert.isPending || remove.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={entry?.status ?? ""}
        onValueChange={(value) => handleStatus(value as LibraryStatus)}
        disabled={busy}
      >
        <SelectTrigger className="w-[180px]" aria-label={t("library.watchStatus")}>
          <SelectValue placeholder={t("library.addToLibrary")} />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`status.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {entry && (
        <Select
          value={entry.score ? String(entry.score) : NO_SCORE}
          onValueChange={handleScore}
          disabled={busy}
        >
          <SelectTrigger className="w-[130px]" aria-label={t("library.yourScore")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SCORE}>{t("library.noScore")}</SelectItem>
            {SCORE_OPTIONS.map((value) => (
              <SelectItem key={value} value={String(value)}>
                {t("library.scoreValue", { value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {entry && <NotesButton note={entry.notes} onSave={handleNotes} busy={busy} />}

      {entry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              aria-label={t("library.removeFromLibrary", { title })}
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("library.removeFromLibrary", { title })}</TooltipContent>
        </Tooltip>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("library.confirmRemoveTitle", { title })}
        pending={remove.isPending}
        onConfirm={handleRemove}
      />
    </div>
  );
}

function NotesButton({
  note,
  onSave,
  busy,
}: {
  note: string | null;
  onSave: (value: string) => void;
  busy: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(note ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label={t("library.notesLabel")}
          className={note ? "text-primary" : undefined}
        >
          <NotebookPenIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-2" align="start">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("library.notesPlaceholder")}
        />
        <Button
          size="sm"
          className="self-end"
          onClick={() => {
            onSave(draft.trim());
            setOpen(false);
          }}
        >
          {t("common.save")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
