import { PlayCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface TrailerButtonProps {
  url: string | null;
  title: string;
  /** Only the icon on a phone — a square beside other square buttons. */
  compact?: boolean;
}

/** The trailer lives behind its own button now — it never autoloads inline. */
export function TrailerButton({ url, title, compact = false }: TrailerButtonProps) {
  const t = useT();
  if (!url) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Sits directly beside the library controls, which are pills now —
            an unrounded button next to them read as a leftover. */}
        <Button
          variant="outline"
          size="lg"
          aria-label={t("trailer.open")}
          className={cn(
            "h-11 shrink-0 border-white/15 bg-black/30 transition-colors duration-200 hover:border-white/30 hover:bg-black/45",
            compact && "max-sm:w-11 max-sm:px-0",
          )}
        >
          <PlayCircleIcon data-icon="inline-start" />
          <span className={cn(compact && "max-sm:sr-only")}>{t("trailer.open")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("trailer.title", { title })}</DialogTitle>
        </DialogHeader>
        <div className="aspect-video w-full bg-black">
          <iframe
            src={url}
            title={t("trailer.title", { title })}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
