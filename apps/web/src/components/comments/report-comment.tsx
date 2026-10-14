import { COMMENT_REPORT_REASONS, type CommentReportReason } from "@animeshadow/shared";
import { FlagIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReportComment } from "@/lib/query";
import { cn } from "@/lib/utils";

const REASONS: Record<CommentReportReason, { title: string; hint: string }> = {
  spam: { title: "Спам или реклама", hint: "Ссылки, продажа, накрутка" },
  abuse: { title: "Оскорбления или травля", hint: "Грубость, угрозы, разжигание" },
  spoiler: { title: "Спойлер без предупреждения", hint: "Раскрывает сюжет наперёд" },
  offtopic: { title: "Не по теме", hint: "Флуд, бессмыслица, не про это аниме" },
  other: { title: "Другое", hint: "Расскажите в комментарии" },
};

/**
 * The form behind "Пожаловаться" under a comment: a reason, a few words if
 * wanted. Only admins see it — in the comments tab, under "С жалобами".
 */
export function ReportCommentDialog({ commentId, author, onClose }: { commentId: string; author: string; onClose: () => void }) {
  const report = useReportComment();
  const [reason, setReason] = useState<CommentReportReason | null>(null);
  const [note, setNote] = useState("");

  const send = () => {
    if (!reason) return;
    report.mutate(
      { id: commentId, reason, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (r) => {
          toast.success(r.already ? "Жалоба обновлена" : "Жалоба отправлена", {
            description: "Модераторы посмотрят комментарий. Спасибо!",
          });
          onClose();
        },
        onError: () => toast.error("Не получилось отправить — попробуйте чуть позже"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-rose-500/15 text-rose-400">
              <FlagIcon className="size-4" />
            </span>
            Жалоба на комментарий
          </DialogTitle>
          <DialogDescription>Что не так с комментарием {author}? Жалобу увидят только администраторы.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" className="flex flex-col gap-1.5">
          {COMMENT_REPORT_REASONS.map((r) => {
            const on = reason === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(r)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  on ? "border-rose-400/60 bg-rose-500/10" : "border-[var(--accent-line-soft)] hover:border-foreground/25",
                )}
              >
                <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border-2", on ? "border-rose-400" : "border-muted-foreground/40")}>
                  {on && <span className="size-1.5 rounded-full bg-rose-400" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{REASONS[r].title}</span>
                  <span className="block text-xs text-muted-foreground">{REASONS[r].hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={reason === "other" ? "Что случилось?" : "Подробности, если хотите (необязательно)"}
          className="w-full resize-y rounded-xl border border-[var(--accent-line-soft)] bg-background/50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--accent-line-soft)] px-4 text-sm font-medium transition-colors hover:border-foreground/30"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!reason || report.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {report.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <FlagIcon className="size-4" />}
            Отправить
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
