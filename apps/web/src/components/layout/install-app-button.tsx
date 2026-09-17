import { DownloadIcon, Share2Icon, SquarePlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useT } from "@/i18n";

/** Safari has no programmatic install prompt — the only path is Share →
 * "Add to Home Screen", so that's what this walks through instead of a
 * button that would otherwise silently do nothing on an iPhone. */
function IosInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("pwa.iosDialogTitle")}</DialogTitle>
          <DialogDescription>{t("pwa.iosDialogBody")}</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Share2Icon className="size-4" />
            </span>
            {t("pwa.iosStep1")}
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SquarePlusIcon className="size-4" />
            </span>
            {t("pwa.iosStep2")}
          </li>
        </ol>
        <Button onClick={() => onOpenChange(false)} className="mt-1">
          {t("pwa.gotIt")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Icon-only, for the desktop header row next to the theme/language
 * toggles — the caller wraps it in the same Tooltip those two use, so it
 * reads as one more quiet utility button rather than a promotional banner. */
export function InstallAppButton() {
  const t = useT();
  const { canInstall, isIosSafari, promptInstall } = usePwaInstall();
  const [iosHelp, setIosHelp] = useState(false);

  if (!canInstall && !isIosSafari) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("pwa.install")}
        onClick={() => (canInstall ? void promptInstall() : setIosHelp(true))}
      >
        <DownloadIcon />
      </Button>
      <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />
    </>
  );
}

/** Same affordance, as a labelled row for the mobile menu sheet — matches
 * the "surprise me" quick-action row right above it (icon, label, dashed
 * border), not the header's icon-only shape. */
export function InstallAppMenuRow() {
  const t = useT();
  const { canInstall, isIosSafari, promptInstall } = usePwaInstall();
  const [iosHelp, setIosHelp] = useState(false);

  if (!canInstall && !isIosSafari) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (canInstall ? void promptInstall() : setIosHelp(true))}
        className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <DownloadIcon className="size-4 shrink-0 text-primary" />
        {t("pwa.install")}
      </button>
      <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />
    </>
  );
}
