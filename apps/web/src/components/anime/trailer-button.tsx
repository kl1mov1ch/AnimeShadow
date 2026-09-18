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

interface TrailerButtonProps {
  url: string | null;
  title: string;
}

/** The trailer lives behind its own button now — it never autoloads inline. */
export function TrailerButton({ url, title }: TrailerButtonProps) {
  const t = useT();
  if (!url) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Sits directly beside the library controls, which are pills now —
            an unrounded button next to them read as a leftover. */}
        <Button
          variant="outline"
          size="sm"
          className="rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
        >
          <PlayCircleIcon data-icon="inline-start" />
          {t("trailer.open")}
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
