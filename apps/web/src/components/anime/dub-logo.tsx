import { cn } from "@/lib/utils";

/**
 * A dub studio's mark in the dub list: its own colour and short name, so a
 * favourite studio is found by eye, not by reading. Known studios get their
 * own colours; any other gets a stable colour of its own, worked out from
 * its name — the same studio always looks the same.
 */
const KNOWN: Array<{ match: RegExp; mark: string; bg: string; fg?: string }> = [
  { match: /anilibria/i, mark: "AL", bg: "#b8232f" },
  { match: /anidub/i, mark: "AD", bg: "#1d6fd1" },
  { match: /animevost/i, mark: "AV", bg: "#e0761a" },
  { match: /shiza/i, mark: "SZ", bg: "#7a3cc2" },
  { match: /studio\s*band|studioband/i, mark: "SB", bg: "#111827", fg: "#f5c518" },
  { match: /dream\s*cast/i, mark: "DC", bg: "#0e9f9a" },
  { match: /^jam|jam\s*club/i, mark: "JAM", bg: "#d81b60" },
  { match: /animedia/i, mark: "AM", bg: "#2b59c3" },
  { match: /anistar/i, mark: "AS", bg: "#f2a900", fg: "#1a1a1a" },
  { match: /crunchyroll/i, mark: "CR", bg: "#f47521" },
  { match: /wakanim/i, mark: "WK", bg: "#e5202a" },
  { match: /amazing\s*dub/i, mark: "ADb", bg: "#5b21b6" },
  { match: /persona\s*99/i, mark: "P99", bg: "#be123c" },
  { match: /sovet\s*romantica|советромантика/i, mark: "SR", bg: "#9d174d" },
  { match: /anifilm/i, mark: "AF", bg: "#047857" },
  { match: /kansai/i, mark: "KS", bg: "#b45309" },
  { match: /reanimedia|реанимедиа/i, mark: "RA", bg: "#1e40af" },
  { match: /субтитры|subtitles|sub\b/i, mark: "SUB", bg: "#374151" },
];

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function DubLogo({ name, active, className }: { name: string; active?: boolean; className?: string }) {
  const known = KNOWN.find((k) => k.match.test(name));
  const mark = known?.mark ?? initials(name);
  const bg = known?.bg ?? `hsl(${hue(name)} 45% 38%)`;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg font-display leading-none tracking-tight shadow-sm ring-1 ring-inset ring-white/10 transition-transform duration-200",
        mark.length > 2 ? "text-[8px]" : "text-[10px]",
        active && "scale-105 ring-2 ring-primary/70",
        className,
      )}
      style={{ background: bg, color: known?.fg ?? "#fff" }}
    >
      {mark}
    </span>
  );
}
