import type { AnimeDetail } from "@animeshadow/shared";
import { CheckIcon, CopyIcon, DownloadIcon, Loader2Icon, QrCodeIcon, Share2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import glyph from "@/components/brand/logo-glyph.json";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useImagePalette } from "@/hooks/use-image-palette";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";

/** The site's colour — the QR's corners and its badge. */
const BRAND = "#e11d48";

/** The site's 影 on a rounded brand-coloured square, for the middle of the code. */
function badgeSvg(): string {
  const s = (960 / Math.max(glyph.width, glyph.height)) * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="230" fill="${BRAND}"/><path fill="#fff" transform="translate(500 500) scale(${s} ${-s}) translate(${-glyph.centerX} ${-glyph.centerY})" d="${glyph.d}"/></svg>`;
}

/** The poster's colour, deepened until it reads well on white. */
function inkFrom(rgb: string | undefined): string {
  if (!rgb) return "#1f1f2e";
  const [r, g, b] = rgb.split(",").map((v) => Number(v.trim()));
  const k = 0.55;
  return `rgb(${Math.round(r! * k)}, ${Math.round(g! * k)}, ${Math.round(b! * k)})`;
}

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
        {open && <ShareCard anime={anime} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareCard({ anime }: { anime: AnimeDetail }) {
  const labels = useLabels();
  const title = labels.title(anime);
  const url = `${SITE_URL}${animeHref(anime)}`;
  const poster = imageSrc(anime.imageLargeUrl ?? anime.imageUrl);
  const palette = useImagePalette(poster);
  const holder = useRef<HTMLDivElement>(null);
  const qr = useRef<{ getRawData: (ext: "png") => Promise<Blob | Uint8Array | null> } | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const ink = inkFrom(palette?.rgb);

  useEffect(() => {
    let cancelled = false;
    void import("qr-code-styling").then(({ default: QRCodeStyling }) => {
      if (cancelled || !holder.current) return;
      const code = new QRCodeStyling({
        width: 600,
        height: 600,
        type: "canvas",
        data: url,
        margin: 18,
        // The highest correction: the badge covers the middle and the code
        // still reads.
        qrOptions: { errorCorrectionLevel: "H" },
        image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg())}`,
        imageOptions: { margin: 10, imageSize: 0.3, hideBackgroundDots: true },
        dotsOptions: {
          type: "rounded",
          gradient: {
            type: "linear",
            rotation: Math.PI / 4,
            colorStops: [
              { offset: 0, color: ink },
              { offset: 1, color: BRAND },
            ],
          },
        },
        cornersSquareOptions: { type: "extra-rounded", color: ink },
        cornersDotOptions: { type: "dot", color: BRAND },
        backgroundOptions: { color: "#ffffff" },
      });
      holder.current.replaceChildren();
      code.append(holder.current);
      const canvas = holder.current.querySelector("canvas");
      if (canvas) canvas.className = "block size-full";
      qr.current = code;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url, ink]);

  const pngFile = async (): Promise<File | null> => {
    const data = await qr.current?.getRawData("png");
    if (!data) return null;
    // In a browser it is always a Blob (a Buffer only under Node).
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type: "image/png" });
    return new File([blob], `${anime.slug || anime.id}-qr.png`, { type: "image/png" });
  };

  const share = async () => {
    const text = `Смотри «${title}» на AnimeShadow`;
    try {
      const file = await pngFile();
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${text}: ${url}` });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    void copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Не получилось скопировать ссылку");
    }
  };

  const download = async () => {
    const file = await pngFile();
    if (!file) return;
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  };

  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Смотри «${title}» на AnimeShadow`)}`;
  const accent = palette ? `rgb(${palette.rgb})` : BRAND;

  return (
    <div className="relative isolate overflow-hidden">
      {/* The poster, blurred, and its colour — the card is this title's. */}
      {poster && (
        <img
          aria-hidden
          src={poster}
          alt=""
          className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-35 blur-2xl"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 transition-[background] duration-700"
        style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}33, transparent 60%), linear-gradient(to bottom, transparent, var(--background) 85%)` }}
      />
      <LogoWatermark className="-bottom-16 -right-14 size-64 -rotate-12 text-foreground/[0.05]" />

      <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-6">
        <div className="flex w-full items-center gap-3">
          {poster && (
            <img src={poster} alt="" className="h-[4.25rem] w-12 shrink-0 rounded-lg object-cover shadow-lg shadow-black/40 ring-1 ring-white/10" />
          )}
          <div className="min-w-0">
            <DialogTitle className="line-clamp-2 font-display text-lg leading-tight">{title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              Наведите камеру — откроется эта страница
            </DialogDescription>
          </div>
        </div>

        {/* The code, on white so every camera reads it, in a frame of the poster's colour. */}
        <div
          className="relative w-full max-w-[16.5rem] animate-in rounded-[1.6rem] p-[3px] shadow-2xl shadow-black/40 duration-500 fade-in-0 zoom-in-95"
          style={{ background: `linear-gradient(135deg, ${accent}, ${BRAND})` }}
        >
          <div className="relative aspect-square overflow-hidden rounded-[1.45rem] bg-white">
            <div ref={holder} className={cn("size-full transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")} />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2Icon className="size-6 animate-spin text-neutral-400" />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void copy()}
          className="group flex w-full items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/40"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground group-hover:text-foreground">
            {url.replace(/^https?:\/\//, "")}
          </span>
          {copied ? (
            <CheckIcon className="size-4 shrink-0 animate-in zoom-in-50 text-emerald-400" />
          ) : (
            <CopyIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
          )}
        </button>

        <div className="grid w-full grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void share()}
            className="col-span-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            <Share2Icon className="size-4" />
            Поделиться
          </button>
          <a
            href={telegram}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 text-xs font-medium transition-colors hover:border-[#2aabee]/50 hover:text-[#2aabee]"
          >
            <TelegramGlyph className="size-4" />
            Telegram
          </a>
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 text-xs font-medium transition-colors hover:border-foreground/25"
          >
            <CopyIcon className="size-4" />
            Ссылка
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={!ready}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-card/60 text-xs font-medium transition-colors hover:border-foreground/25 disabled:opacity-50"
          >
            <DownloadIcon className="size-4" />
            Скачать
          </button>
        </div>
      </div>
    </div>
  );
}

function TelegramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M21.94 4.57a1.5 1.5 0 0 0-2-1.35L3.2 9.86c-1.36.53-1.35 2.47.02 2.98l3.98 1.49 1.54 4.95a1.2 1.2 0 0 0 1.97.5l2.2-2.06 4.13 3.04a1.5 1.5 0 0 0 2.36-.94l2.54-15.2ZM9.4 13.66l7.9-4.98-6.53 6.06c-.23.22-.38.5-.44.82l-.28 1.53-.65-3.45Z" />
    </svg>
  );
}
