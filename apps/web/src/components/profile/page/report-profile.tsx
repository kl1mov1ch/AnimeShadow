import { REPORT_REASONS, type ReportReason } from "@animeshadow/shared";
import { FlagIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useReportProfile } from "@/lib/query";
import { cn } from "@/lib/utils";

const REASONS: Record<ReportReason, { title: string; hint: string }> = {
  spam: { title: "Спам или реклама", hint: "Ссылки, продажа, накрутка" },
  abuse: { title: "Оскорбления или травля", hint: "Грубость, угрозы, преследование" },
  content: { title: "Недопустимый аватар, обложка или описание", hint: "Шок-контент, 18+, ненависть" },
  impersonation: { title: "Выдаёт себя за другого", hint: "Чужое имя, фото или бренд" },
  other: { title: "Другое", hint: "Расскажите в комментарии" },
};

/**
 * "Пожаловаться" on someone's profile: a flag button and the form behind
 * it — a reason, a few words if wanted. It goes to the admins, who see the
 * profile and every complaint about it in one place.
 */
export function ReportProfileButton({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (user?.id === userId) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (status !== "authenticated") {
            navigate("/login", { state: { from: window.location.pathname } });
            return;
          }
          setOpen(true);
        }}
        title="Пожаловаться на профиль"
        aria-label="Пожаловаться на профиль"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-black/35 text-muted-foreground backdrop-blur-sm transition-colors hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-300",
          className,
        )}
      >
        <FlagIcon className="size-4" />
      </button>
      {open && <ReportDialog userId={userId} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const report = useReportProfile(userId);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState("");

  const send = () => {
    if (!reason) return;
    report.mutate(
      { reason, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: (r) => {
          toast.success(r.already ? "Жалоба обновлена" : "Жалоба отправлена", {
            description: "Модераторы посмотрят профиль. Спасибо, что помогаете.",
          });
          onClose();
        },
        onError: () => toast.error("Не получилось отправить — попробуйте чуть позже"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-rose-500/15 text-rose-400">
              <FlagIcon className="size-4" />
            </span>
            Жалоба на профиль
          </DialogTitle>
          <DialogDescription>
            Что не так с профилем {name}? Жалобу увидят только администраторы.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" className="flex flex-col gap-1.5">
          {REPORT_REASONS.map((r) => {
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
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          rows={3}
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
            Отправить жалобу
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
