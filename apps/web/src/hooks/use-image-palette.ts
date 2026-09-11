import { useEffect, useState } from "react";

export interface Palette {
  /** A vivid, display-ready "r, g, b" string for CSS. */
  rgb: string;
  isDark: boolean;
}

const HUE_BINS = 24; // 15° per bin
/** The backdrop is always a bright, saturated wash — never a muddy average. */
const OUT_SATURATION = 0.72;
const OUT_LIGHTNESS = 0.58;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/** Stable pleasant hue for posters that have no colour at all (B&W art). */
function fallbackHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/**
 * Same vivid wash as `useImagePalette`, but derived purely from a stable seed
 * (no image to sample) — for titles with no artwork at all, so the ambient
 * backdrop always has *some* colour instead of going flat.
 */
export function paletteFromSeed(seed: string): Palette {
  const rgb = hslToRgb(fallbackHue(seed), OUT_SATURATION, OUT_LIGHTNESS);
  return { rgb: `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`, isDark: OUT_LIGHTNESS < 0.5 };
}

/**
 * Picks the title's *dominant* colour (not its average) and re-emits it at a
 * fixed vivid saturation/lightness, so the page wash is always a pleasant
 * bright hue — dark or washed-out artwork can't drag it to grey. Pixels with
 * no real colour are ignored entirely; a fully greyscale poster falls back to
 * a stable hue derived from its URL.
 *
 * Needs permissive CORS on the image (the /api/img proxy sets
 * `access-control-allow-origin: *`); returns null on a tainted canvas.
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

        // Weight every coloured pixel into a hue bucket. Weighting by
        // saturation (and preferring mid-lightness) keeps washed-out corners
        // and black outlines from deciding the result.
        const weights = new Array<number>(HUE_BINS).fill(0);
        const hueSin = new Array<number>(HUE_BINS).fill(0);
        const hueCos = new Array<number>(HUE_BINS).fill(0);
        let coloured = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 200) continue;
          const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
          if (s < 0.18 || l < 0.1 || l > 0.92) continue; // no usable colour
          const weight = s * (1 - Math.abs(l - 0.5) * 1.2);
          if (weight <= 0) continue;
          const bin = Math.min(HUE_BINS - 1, Math.floor((h / 360) * HUE_BINS));
          const rad = (h * Math.PI) / 180;
          weights[bin]! += weight;
          hueSin[bin]! += Math.sin(rad) * weight;
          hueCos[bin]! += Math.cos(rad) * weight;
          coloured += 1;
        }

        let best = 0;
        for (let bin = 1; bin < HUE_BINS; bin += 1) {
          if (weights[bin]! > weights[best]!) best = bin;
        }

        const hue =
          coloured > 0 && weights[best]! > 0
            ? (Math.atan2(hueSin[best]!, hueCos[best]!) * 180) / Math.PI
            : fallbackHue(url);

        const rgb = hslToRgb(hue, OUT_SATURATION, OUT_LIGHTNESS);
        setPalette({
          rgb: `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`,
          isDark: OUT_LIGHTNESS < 0.5,
        });
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
