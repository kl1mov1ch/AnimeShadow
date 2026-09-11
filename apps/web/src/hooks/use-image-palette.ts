import { useEffect, useState } from "react";

export interface Palette {
  /** average "colourful" pixel, as an "r, g, b" string ready for CSS */
  rgb: string;
  isDark: boolean;
}

function toRgb(r: number, g: number, b: number): string {
  return `${r}, ${g}, ${b}`;
}

/**
 * Pulls a representative colour out of an image so a page can take on the
 * title's palette. Samples a 32×32 downscale, ignores near-black / near-white
 * pixels, averages the rest. Needs the image served with permissive CORS
 * (the /api/img proxy sets `access-control-allow-origin: *`); silently returns
 * null if the canvas ends up tainted or the image fails.
 */
export function useImagePalette(url: string | undefined): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);

  useEffect(() => {
    setPalette(null);
    if (!url) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 200) continue;
          const rr = data[i]!;
          const gg = data[i + 1]!;
          const bb = data[i + 2]!;
          const max = Math.max(rr, gg, bb);
          const min = Math.min(rr, gg, bb);
          if (max < 28 || min > 232) continue; // skip near-black / near-white
          r += rr;
          g += gg;
          b += bb;
          n += 1;
        }
        if (n === 0) return;
        const avg: [number, number, number] = [
          Math.round(r / n),
          Math.round(g / n),
          Math.round(b / n),
        ];
        const luma =
          (0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2]) / 255;
        setPalette({ rgb: toRgb(...avg), isDark: luma < 0.5 });
      } catch {
        /* tainted canvas or decode failure — no palette, no problem */
      }
    };
    img.onerror = () => undefined;
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return palette;
}
