import { useId } from "react";
import { cn } from "@/lib/utils";
import type { LevelInfo } from "./profile-level";

/** One SVG, with no particles, timers, blur layers or animated gradients. */
export function LevelBadge({ info, size = 56, className }: { info: LevelInfo; size?: number; className?: string; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  const value = Math.max(0, Math.min(1, info.progress));
  return <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} aria-label={`${info.level} уровень · ${info.tier.name}`}>
    <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-0 size-full">
      <defs><linearGradient id={id}><stop stopColor={info.tier.colors[0]} /><stop offset="1" stopColor={info.tier.colors[1]} /></linearGradient></defs>
      <rect x="5" y="5" width="54" height="54" rx="18" fill="currentColor" className="text-secondary" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" className="text-border" strokeWidth="3" />
      <circle cx="32" cy="32" r="27" fill="none" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${value * 100} 100`} transform="rotate(-90 32 32)" />
    </svg>
    <span className="relative font-display font-bold tabular-nums" style={{ fontSize: size * (info.level > 99 ? 0.28 : 0.34), color: info.tier.colors[0] }}>{info.level}</span>
  </span>;
}

export function LevelBar({ info, labels = true, className }: { info: LevelInfo; labels?: boolean; className?: string }) {
  const value = Math.max(0, Math.min(1, info.progress));
  const maxed = info.ceiling === info.floor;
  const remaining = Math.max(0, info.ceiling - info.xp);
  return <div className={cn("flex min-w-0 flex-col gap-2", className)}>
    <div role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="h-2 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: `linear-gradient(90deg,${info.tier.colors[0]},${info.tier.colors[1]})` }} />
    </div>
    {labels && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] tabular-nums"><span className="font-medium text-foreground">{info.xp.toLocaleString("ru-RU")} XP</span><span className="text-muted-foreground">{maxed ? "Максимальный уровень" : `${remaining.toLocaleString("ru-RU")} XP до ${info.level + 1} уровня`}</span></div>}
  </div>;
}
