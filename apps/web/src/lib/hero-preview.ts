export function allowHeroPreview(connection?: { saveData?: boolean; effectiveType?: string; downlink?: number }): boolean {
  return !connection?.saveData && !/^(slow-2g|2g)$/.test(connection?.effectiveType ?? "");
}

export interface DirectPreview {
  url: string;
  kind: "opening" | "ending";
  source: string;
  pageUrl: string | null;
}

