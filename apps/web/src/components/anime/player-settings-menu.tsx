import { ChevronLeftIcon, ChevronRightIcon, GaugeIcon, RotateCwIcon } from "lucide-react";
import { forwardRef, useState } from "react";
import { useT } from "@/i18n";
import { SKIP_STEPS, SPEEDS, speedLabel } from "@/lib/player-settings";
import { cn } from "@/lib/utils";

export type QualityChoice =
  | { options: Array<{ value: string; label: string }>; value: string; onPick: (value: string) => void }
  | { note: string; /** The one quality there is, when known ("720p"). */ current?: string };

export type SettingsPage = "main" | "quality" | "speed" | "step";

/**
 * The player's settings — quality, speed, how far a skip jumps — as a small
 * panel inside the picture, one list at a time: the overview first, then
 * the one setting being changed, with a way back. A list of three rows and
 * then of four or seven choices fits a phone's 200-pixel-high player
 * without scrolling, where every setting at once did not fit anywhere.
 *
 * Drawn inline rather than in a portal on purpose: a portal goes to the
 * page's <body>, which is invisible while the player is fullscreen and is
 * the wrong document entirely once the player sits in its own window.
 */
export const PlayerSettingsMenu = forwardRef<
  HTMLDivElement,
  {
    speed: number;
    onSpeed: (rate: number) => void;
    step: number;
    onStep: (seconds: number) => void;
    quality: QualityChoice;
    /** The list it opens on — the quality button opens straight on quality. */
    initialPage?: SettingsPage;
    /** A choice made: the panel has done its job. */
    onClose: () => void;
    className?: string;
  }
>(function PlayerSettingsMenu({ speed, onSpeed, step, onStep, quality, initialPage = "main", onClose, className }, ref) {
  const t = useT();
  const [page, setPage] = useState<SettingsPage>(initialPage);

  const qualityNow =
    "note" in quality ? null : (quality.options.find((o) => o.value === quality.value)?.label ?? null);
  const pick = (apply: () => void) => {
    apply();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("watch.ctl.settings")}
      className={cn(
        "flex max-h-full w-full max-w-[17.5rem] animate-in flex-col overflow-hidden rounded-xl border border-white/10 bg-neutral-950/95 text-white shadow-2xl shadow-black/50 duration-150 fade-in-0 zoom-in-95",
        className,
      )}
    >
      {page === "main" ? (
        <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain p-1.5">
          <Row
            icon={<span className="rounded-[4px] border border-current px-0.5 text-[9px] font-bold leading-tight">HD</span>}
            label={t("watch.ctl.quality")}
            value={qualityNow ?? ("note" in quality ? quality.current : undefined) ?? "—"}
            onClick={() => setPage("quality")}
          />
          <Row
            icon={<GaugeIcon className="size-4" />}
            label={t("watch.ctl.speed")}
            value={speed === 1 ? t("watch.ctl.speedNormal") : speedLabel(speed)}
            onClick={() => setPage("speed")}
          />
          <Row
            icon={<RotateCwIcon className="size-4" />}
            label={t("watch.ctl.step")}
            value={t("watch.ctl.stepValue", { n: step })}
            onClick={() => setPage("step")}
          />
          <p className="mx-1 mt-1 border-t border-white/10 px-1.5 pb-0.5 pt-2 text-[10px] leading-snug text-white/45 pointer-coarse:hidden">
            {t("watch.ctl.keys")}
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setPage("main")}
            className="flex h-10 shrink-0 items-center gap-1.5 border-b border-white/10 px-2.5 text-sm font-medium transition-colors hover:bg-white/[0.06]"
          >
            <ChevronLeftIcon className="size-4 text-white/60" />
            {page === "quality" ? t("watch.ctl.quality") : page === "speed" ? t("watch.ctl.speed") : t("watch.ctl.step")}
          </button>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-1.5">
            {page === "quality" &&
              ("note" in quality ? (
                <p className="px-2 py-2 text-xs leading-snug text-white/60">{quality.note}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {quality.options.map((option) => (
                    <Chip
                      key={option.value}
                      active={option.value === quality.value}
                      onClick={() => pick(() => quality.onPick(option.value))}
                    >
                      {option.label}
                    </Chip>
                  ))}
                </div>
              ))}
            {page === "speed" && (
              <div className="grid grid-cols-4 gap-1">
                {SPEEDS.map((rate) => (
                  <Chip key={rate} active={rate === speed} onClick={() => pick(() => onSpeed(rate))}>
                    {rate === 1 ? "1×" : speedLabel(rate)}
                  </Chip>
                ))}
              </div>
            )}
            {page === "step" && (
              <div className="grid grid-cols-5 gap-1">
                {SKIP_STEPS.map((n) => (
                  <Chip key={n} active={n === step} onClick={() => pick(() => onStep(n))}>
                    {t("watch.ctl.stepValue", { n })}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});

function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-full shrink-0 items-center gap-3 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-white/[0.07] active:bg-white/10"
    >
      <span className="grid w-5 shrink-0 place-items-center text-white/70">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-white/60">{value}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-white/40" />
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 rounded-lg text-xs tabular-nums transition-colors duration-150",
        active ? "bg-primary font-semibold text-primary-foreground" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.14]",
      )}
    >
      {children}
    </button>
  );
}
