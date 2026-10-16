export const FREE_QUALITY_HEIGHT = 720;
export const PRO_OUTPUT_HEIGHTS = [1080, 1440] as const;

/** A saved PRO choice must stop applying when the subscription ends. */
export function effectiveQuality(quality: string, pro: boolean): string {
  return !pro && Number(quality) > FREE_QUALITY_HEIGHT ? "auto" : quality;
}

/** Best real stream at or below the requested output; -1 keeps adaptive ABR. */
export function qualityLevel(heights: number[], quality: string): number {
  if (quality === "auto" || heights.length === 0) return -1;
  const target = Number(quality);
  let best = -1;
  let lowest = 0;
  heights.forEach((height, index) => {
    if (height < heights[lowest]!) lowest = index;
    if (height <= target && (best < 0 || height > heights[best]!)) best = index;
  });
  return best < 0 ? lowest : best;
}

export function qualityHeights(heights: number[]): number[] {
  return [...new Set([...heights.filter((height) => Number.isFinite(height) && height > 0), ...PRO_OUTPUT_HEIGHTS])].sort((a, b) => b - a);
}

/** Only explicit PRO choices can allocate an upscaled output canvas. */
export function qualityOutputHeight(quality: string, pro: boolean): 1080 | 1440 | null {
  if (!pro) return null;
  return PRO_OUTPUT_HEIGHTS.find((height) => String(height) === quality) ?? null;
}

export function qualityName(height: number): string {
  return height === 1440 ? "2K (1440p)" : `${height}p`;
}
