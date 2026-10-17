import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, Loader2Icon, PlayCircleIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api";
import type { DirectPreview } from "@/lib/hero-preview";
import { cn } from "@/lib/utils";

interface TrailerButtonProps { url: string | null; title: string; animeId?: number; compact?: boolean; onOpenChange?: (open: boolean) => void }

export function TrailerButton({ url, title, animeId, compact = false, onOpenChange }: TrailerButtonProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const direct = url && /^https:\/\/[^\s]+\.(mp4|webm)(\?.*)?$/i.test(url) ? url : null;
  const { data, isLoading } = useQuery({
    queryKey: ["direct-preview", animeId], enabled: open && !!animeId && !direct,
    queryFn: ({ signal }) => apiRequest<{ preview: DirectPreview | null }>(`/anime/${animeId}/preview`, { signal }),
    staleTime: 10 * 60_000, retry: false,
  });
  if (!url && !animeId) return null;
  const preview = data?.preview;
  const videoUrl = direct ?? preview?.url;
  const kind = direct ? "Трейлер" : preview?.kind === "ending" ? "Эндинг" : "Опенинг";
  const externalUrl = url?.replace(/https:\/\/(?:www\.)?youtube-nocookie.com\/embed\/([^?]+).*/, "https://www.youtube.com/watch?v=$1");
  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); setFailed(false); onOpenChange?.(value); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" aria-label="Открыть видео"
          className={cn("h-11 shrink-0 border-white/15 bg-black/30 hover:border-white/30 hover:bg-black/45", compact && "max-sm:w-11 max-sm:px-0")}>
          <PlayCircleIcon data-icon="inline-start" /><span className={cn(compact && "max-sm:sr-only")}>Видео</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12"><DialogTitle className="text-sm leading-relaxed">{title}</DialogTitle></DialogHeader>
        <div className="aspect-video w-full bg-black">
          {open && videoUrl && !failed ? <video key={videoUrl} src={videoUrl} controls autoPlay playsInline preload="metadata"
            aria-label={`${kind}: ${title}`} onError={() => setFailed(true)} className="size-full" />
            : <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/70">
              {isLoading ? <><Loader2Icon className="size-6 animate-spin" /><span>Ищем видео…</span></>
                : <span>{failed ? "Видео сейчас недоступно" : "Прямого видео пока нет"}</span>}
            </div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-xs text-muted-foreground">
          <span>{videoUrl && !failed ? `${kind}${preview ? " · AnimeThemes" : ""}` : isLoading ? "" : "Попробуйте позже"}</span>
          {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
            Официальный трейлер <ExternalLinkIcon className="size-3.5" />
          </a>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
