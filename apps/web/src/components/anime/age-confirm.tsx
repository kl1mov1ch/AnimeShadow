import { useNavigate } from "react-router-dom";
import { imageSrc } from "@/lib/format";

const KEY = "as:adult-ok";

/** Whether this browser has answered "yes, I'm 18" already. */
export function adultConfirmed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Before an 18+ title: a plain question, no birth dates. «Да» opens it (and
 * every other 18+ title in this browser), «Нет» goes to the home page.
 */
export function AgeConfirm({ poster, title, onYes }: { poster: string | null; title: string; onYes: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="relative isolate mx-auto flex min-h-[60dvh] max-w-lg items-center justify-center overflow-hidden rounded-3xl border border-[var(--accent-line-soft)] p-6 sm:p-10">
      {poster && (
        <img src={imageSrc(poster, 360)} alt="" aria-hidden className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-25 blur-2xl" />
      )}
      <div className="absolute inset-0 -z-10 bg-background/70" />
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-lg bg-rose-600 px-3 py-1 font-display text-lg text-white shadow-lg shadow-rose-900/40">18+</span>
        <h1 className="font-display text-2xl leading-tight">Вам есть 18 лет?</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          «{title}» — тайтл с откровенными сценами, только для совершеннолетних.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(KEY, "1");
              } catch {
                // No storage: asked again next time.
              }
              onYes();
            }}
            className="h-11 w-full shrink-0 rounded-xl sm:flex-1 bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            Да, мне есть 18
          </button>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className="h-11 w-full shrink-0 rounded-xl sm:flex-1 border border-[var(--accent-line-soft)] text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Нет
          </button>
        </div>
      </div>
    </div>
  );
}
