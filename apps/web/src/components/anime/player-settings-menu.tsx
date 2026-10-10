import { useT } from "@/i18n";
import { SKIP_STEPS, SPEEDS, speedLabel } from "@/lib/player-settings";
import { cn } from "@/lib/utils";

export type QualityChoice =
  | { options: Array<{ value: string; label: string }>; value: string; onPick: (value: string) => void }
  | { note: string };

/**
 * The player's settings — speed, how far the skip buttons jump, quality —
 * as a panel that opens above the control bar.
 *
 * Drawn inline rather than in a portal on purpose: a portal goes to the
 * page's <body>, which is invisible while the player is fullscreen and is
 * the wrong document entirely once the player sits in its own window.
 */
export function PlayerSettingsMenu({
  speed,
  onSpeed,
  step,
  onStep,
  quality,
  className,
}: {
  speed: number;
  onSpeed: (rate: number) => void;
  step: number;
  onStep: (seconds: number) => void;
  quality: QualityChoice;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "absolute bottom-full right-1 z-30 mb-2 w-[min(19rem,calc(100vw-2rem))] animate-in rounded-xl border border-border/70 bg-popover p-3 text-left text-popover-foreground shadow-lg shadow-black/30 duration-150 fade-in-0 slide-in-from-bottom-1",
        className,
      )}
    >
      <MenuRow label={t("watch.ctl.speed")}>
        {SPEEDS.map((rate) => (
          <Choice key={rate} active={rate === speed} onClick={() => onSpeed(rate)}>
            {rate === 1 ? t("watch.ctl.speedNormal") : speedLabel(rate)}
          </Choice>
        ))}
      </MenuRow>
      <MenuRow label={t("watch.ctl.step")}>
        {SKIP_STEPS.map((n) => (
          <Choice key={n} active={n === step} onClick={() => onStep(n)}>
            {t("watch.ctl.stepValue", { n })}
          </Choice>
        ))}
      </MenuRow>
      <MenuRow label={t("watch.ctl.quality")}>
        {"note" in quality ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{quality.note}</p>
        ) : (
          quality.options.map((option) => (
            <Choice key={option.value} active={option.value === quality.value} onClick={() => quality.onPick(option.value)}>
              {option.label}
            </Choice>
          ))
        )}
      </MenuRow>
      <p className="mt-2 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground/80">
        {t("watch.ctl.keys")}
      </p>
    </div>
  );
}

function MenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-md px-2 text-xs tabular-nums transition-colors duration-150",
        active ? "bg-primary/15 font-medium text-primary" : "bg-foreground/[0.05] text-foreground/80 hover:bg-foreground/10",
      )}
    >
      {children}
    </button>
  );
}
