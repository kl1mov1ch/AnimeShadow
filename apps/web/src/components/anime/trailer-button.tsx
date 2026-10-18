import { ExternalLinkIcon, PlayCircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { youtubeTrailer } from "@/lib/youtube-trailer";
import { cn } from "@/lib/utils";

interface TrailerButtonProps { url: string | null; title: string; animeId?: number; compact?: boolean; onOpenChange?: (open: boolean) => void }

export function TrailerButton({ url, title, compact = false, onOpenChange }: TrailerButtonProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const trailer = youtubeTrailer(url);
  if (!trailer) return null;
  const change = (value: boolean) => { setOpen(value); setFailed(false); onOpenChange?.(value); };
  return <>
    <Button variant="outline" size="lg" aria-label="Открыть трейлер" onClick={() => change(true)} className={cn("h-11 shrink-0 border-white/15 bg-black/30 hover:border-white/30", compact && "max-sm:w-11 max-sm:px-0")}>
      <PlayCircleIcon /><span className={cn(compact && "max-sm:sr-only")}>Трейлер</span>
    </Button>
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pt-4 pr-12"><DialogTitle className="text-sm leading-relaxed">Трейлер · {title}</DialogTitle></DialogHeader>
        <div className="aspect-video bg-black">
          {open && !failed ? <iframe src={trailer.embed} title={`Трейлер: ${title}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} className="size-full border-0" /> : <p className="flex size-full items-center justify-center p-4 text-sm text-white/70">Трейлер не загрузился. Откройте его на YouTube.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-xs text-muted-foreground"><span>Если встраивание недоступно, откройте ролик отдельно.</span><a href={trailer.watch} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-primary">На YouTube<ExternalLinkIcon className="size-3.5" /></a></div>
      </DialogContent>
    </Dialog>
  </>;
}
