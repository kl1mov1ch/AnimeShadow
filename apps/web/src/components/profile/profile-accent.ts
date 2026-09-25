import type { CSSProperties } from "react";
import { useImagePalette } from "@/hooks/use-image-palette";
import { imageSrc } from "@/lib/format";

/**
 * The owner's colour, as CSS variables for their profile — wherever it is
 * shown, the full page or the small card opened from a comment. Every
 * accent-derived token is re-declared, because the derived ones were
 * resolved at the root and would otherwise keep the site's colour inside.
 */
export function useProfileAccentStyle(
  profile: { accentColor: string | null; avatarUrl: string | null; layout: { autoAccent: boolean } } | undefined,
): CSSProperties | undefined {
  const palette = useImagePalette(
    profile?.layout.autoAccent && profile.avatarUrl ? imageSrc(profile.avatarUrl) : undefined,
  );
  const accent =
    profile?.layout.autoAccent && palette ? `rgb(${palette.rgb})` : (profile?.accentColor ?? null);
  if (!accent) return undefined;
  return {
    "--primary": accent,
    "--accent": accent,
    "--ring": accent,
    "--accent-ink": accent,
    "--accent-line": `color-mix(in srgb, ${accent} 45%, transparent)`,
    "--accent-line-soft": `color-mix(in srgb, ${accent} 20%, transparent)`,
    "--accent-surface": `color-mix(in srgb, ${accent} 7%, transparent)`,
    "--accent-surface-strong": `color-mix(in srgb, ${accent} 14%, transparent)`,
  } as CSSProperties;
}
