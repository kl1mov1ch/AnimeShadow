import { CheckIcon, EyeIcon, TargetIcon } from "lucide-react";

export function FrameGameGoal({ streak }: { streak: number }) {
  const goal =
    [3, 5, 10, 20, 50].find((value) => value > streak) ??
    Math.ceil((streak + 1) / 10) * 10;
  const steps = goal <= 5 ? goal : 5;
  const progress = Math.min(streak / goal, 1);
  return (
    <aside
      aria-label="Цель игровой серии"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3.5"
    >
      <div className="flex items-center gap-2 text-xs font-semibold">
        <TargetIcon className="size-4 text-primary" />
        Следующая цель
        <span className="ml-auto tabular-nums text-muted-foreground">
          {streak} / {goal}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium">
        {goal} верных {goal === 3 ? "ответа" : "ответов"} подряд
      </p>
      <div
        className="mt-3 flex gap-1.5"
        aria-label={`Цель выполнена на ${Math.round(progress * 100)}%`}
      >
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className="relative grid h-6 flex-1 place-items-center overflow-hidden rounded-md border border-primary/15 bg-primary/[0.04]"
          >
            <span
              className="absolute inset-y-0 left-0 bg-primary/25 transition-[width] duration-300 motion-reduce:transition-none"
              style={{
                width: `${Math.max(0, Math.min(1, progress * steps - i)) * 100}%`,
              }}
            />
            {progress * steps >= i + 1 && (
              <CheckIcon className="relative size-3 text-primary" />
            )}
          </span>
        ))}
      </div>
      <div className="mt-auto flex items-start gap-2 border-t border-border/50 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <EyeIcon className="mt-0.5 size-3.5 shrink-0 text-primary/80" />
        <p>
          Нужна деталь? Наведи на кадр — под курсором он станет чётче. На телефоне
          удерживай палец.
        </p>
      </div>
    </aside>
  );
}
