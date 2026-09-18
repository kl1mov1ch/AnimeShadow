import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/i18n";

/** Generic yes/no confirmation before a destructive action. Caller owns the open state. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {/* A destructive action should look like one before it is taken:
            the warning mark carries that, so the title does not have to
            shout it in words. */}
        <DialogHeader className="items-center gap-3 text-center sm:text-center">
          <span
            aria-hidden
            className="animate-in zoom-in-50 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive duration-300"
          >
            <TriangleAlertIcon className="size-6" />
          </span>
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description && (
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button
            variant="outline"
            className="rounded-full sm:min-w-28"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          {/* `pending` used to only grey the button out, which reads as
              broken rather than busy — it now says so. */}
          <Button
            variant="destructive"
            className="rounded-full sm:min-w-28"
            disabled={pending}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
