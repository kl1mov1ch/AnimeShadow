import type { AnimeDetail } from "@animeshadow/shared";
import { QrCodeIcon } from "lucide-react";
import { useState } from "react";
import { QrShareCard } from "@/components/common/qr-share";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { SITE_URL } from "@/lib/seo";

/**
 * A QR code for the title, in its place in the page header: a tap opens a
 * card with the code — dots in the poster's own colour running into the
 * site's, the 影 badge in the middle — the title, and ways to pass it on:
 * the phone's share sheet (the code itself as a picture where it can),
 * Telegram, the link, or the picture saved. Scanning it opens this title.
 *
 * The QR library is loaded only when the card opens.
 */
export function ShareQrButton({ anime }: { anime: AnimeDetail }) {
  const [open, setOpen] = useState(false);
  const labels = useLabels();
  const title = labels.title(anime);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="QR-код и ссылка на аниме"
              className="group inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2 text-xs font-medium text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-foreground active:scale-95"
            >
              <QrCodeIcon className="size-3.5 transition-transform duration-300 group-hover:scale-110 group-hover:text-primary" />
              <span className="hidden sm:inline">QR-код</span>
            </button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Поделиться: QR-код и ссылка</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-sm">
        {open && (
          <QrShareCard
            url={`${SITE_URL}${animeHref(anime)}`}
            title={title}
            description="Наведите камеру — откроется эта страница"
            image={imageSrc(anime.imageLargeUrl ?? anime.imageUrl)}
            filename={`${anime.slug || anime.id}-qr`}
            shareText={`Смотри «${title}» на AnimeShadow`}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
