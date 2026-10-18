import { useState } from "react";
import { QrCodeIcon } from "lucide-react";
import { QrShareCard } from "@/components/common/qr-share";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Share a public address even when reviewing the studio locally. */
export function StudioShare({ releases = false }: { releases?: boolean }) {
  const [open, setOpen] = useState(false);
  const url = `https://animeshadow.online/studio/hon-kon${releases ? "/releases" : ""}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="hk-text-link"
          aria-label="Поделиться страницей Hon-Kon: QR-код и ссылка"
        >
          <QrCodeIcon aria-hidden />
          Поделиться
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-sm">
        {open && (
          <QrShareCard
            url={url}
            title="Hon-Kon Studio × AnimeShadow"
            description={
              releases
                ? "Все релизы в озвучке Hon-Kon"
                : "Голоса, команда и любимые истории"
            }
            image="/studios/hon-kon/logo.svg"
            imageShape="avatar"
            badgeImage="/studios/hon-kon/collab-badge.svg"
            filename={`hon-kon${releases ? "-releases" : ""}-qr`}
            shareText="Смотрите аниме с голосами Hon-Kon Studio на AnimeShadow"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
