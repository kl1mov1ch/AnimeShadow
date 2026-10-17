import { BellRingIcon, CalendarClockIcon, Loader2Icon, PlayIcon, SparklesIcon, XIcon, ZapIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { currentSubscription, enablePushHere, offerMemory, pushSupport, rememberOffer } from "@/lib/push";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
/** After "Не сейчас": the big offer comes back in a week, the corner card in three days. */
const DISMISS_MODAL_DAYS = 7;
const CORNER_AFTER_DAYS = 3;
/** Push turned off: offered again (in the corner only) after two days. */
const OFF_AGAIN_DAYS = 2;

type Mode = "modal" | "corner" | null;

/**
 * "Новые серии — сразу на экран": offered to everyone, guests included, who
 * can have browser push and hasn't got it. Once per visit at most, after the
 * visitor has had a look around (half a minute, or a second page); never on
 * top of the guest invite. "Не сейчас" puts it away for a week — in three
 * days a small card in the bottom-left corner asks again; push turned off
 * (the subscription is deleted) brings back only that card, two days later.
 */
export function PushOffer() {
  const { status } = useAuth();
  const authed = status === "authenticated";
  const location = useLocation();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const pages = useRef(0);
  const decided = useRef(false);

  useEffect(() => {
    pages.current += 1;
  }, [location.pathname]);

  useEffect(() => {
    if (status === "loading" || decided.current) return;
    if (pushSupport() !== "ok" || Notification.permission === "denied") return;
    let cancelled = false;
    const started = Date.now();
    const tick = setInterval(async () => {
      if (cancelled || decided.current) return;
      const looked = Date.now() - started > 30_000 || pages.current >= 2;
      if (!looked || document.querySelector("[data-guest-nudge], [role=dialog]")) return;
      decided.current = true;
      clearInterval(tick);
      if (await currentSubscription()) return;
      const memory = offerMemory();
      const age = memory ? Date.now() - memory.at : Infinity;
      if (!memory) setMode("modal");
      else if (memory.state === "dismissed" && age > DISMISS_MODAL_DAYS * DAY) setMode("modal");
      else if (memory.state === "dismissed" && age > CORNER_AFTER_DAYS * DAY) setMode("corner");
      else if (memory.state === "off" && age > OFF_AGAIN_DAYS * DAY) setMode("corner");
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [status]);

  // Signed in, with a guest's subscription in this browser: it becomes the account's.
  useEffect(() => {
    if (!authed) return;
    void currentSubscription().then((sub) => {
      if (!sub) return;
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      void apiRequest("/me/push/subscribe", { method: "POST", body: { endpoint: json.endpoint, keys: json.keys } }).catch(() => undefined);
    });
  }, [authed]);

  // The corner card sits under the guest invite: it moves up while this shows.
  useEffect(() => {
    if (mode === "corner") document.documentElement.dataset.pushCorner = "1";
    else delete document.documentElement.dataset.pushCorner;
    return () => {
      delete document.documentElement.dataset.pushCorner;
    };
  }, [mode]);

  const enable = async () => {
    setBusy(true);
    try {
      await enablePushHere(authed);
      setMode(null);
      toast.success("Уведомления включены", {
        description: authed ? "Новые серии из вашего списка придут сюда, даже когда сайт закрыт" : "Новые серии того, что вы смотрите, придут сюда",
      });
    } catch (error) {
      const reason = (error as Error).message;
      if (reason === "denied") {
        setMode(null);
        toast.error("Браузер запретил уведомления", { description: "Их можно разрешить в настройках сайта — значок замка у адреса" });
      } else if (reason === "dismissed") {
        rememberOffer("dismissed");
        setMode(null);
      } else {
        toast.error("Не получилось включить уведомления");
      }
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    rememberOffer("dismissed");
    setMode(null);
  };

  if (mode === "corner") {
    return (
      <div className="fixed inset-x-3 bottom-[calc(var(--mobile-nav-space,0px)+0.75rem)] z-40 animate-in fade-in-0 slide-in-from-bottom-4 duration-500 md:inset-x-auto md:bottom-5 md:left-5 md:w-[21rem]">
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-card/95 p-3 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.8)] backdrop-blur">
          <span className="push-bell grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <BellRingIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Уведомления о новых сериях</p>
            <p className="text-xs text-muted-foreground">Сразу на экран, даже когда сайт закрыт</p>
          </div>
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            Включить
          </button>
          <button type="button" onClick={later} aria-label="Не сейчас" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={mode === "modal"} onOpenChange={(open) => !open && later()}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-w-md">
        <div className="relative overflow-hidden px-6 pb-5 pt-7 text-center">
          <span
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(70% 90% at 50% 0%, color-mix(in srgb, var(--primary) 28%, transparent), transparent 70%), radial-gradient(50% 60% at 90% 30%, color-mix(in srgb, #a855f7 22%, transparent), transparent 70%)",
            }}
          />
          <span className="push-bell relative mx-auto grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/30">
            <BellRingIcon className="size-8" />
            <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-white text-[11px] font-bold text-primary shadow">1</span>
          </span>
          <DialogTitle className="mt-4 font-display text-2xl leading-tight">Новые серии — сразу на экран</DialogTitle>
          <DialogDescription className="mx-auto mt-1.5 max-w-xs text-sm">
            {authed
              ? "Как только выйдет серия аниме из вашего списка, придёт уведомление — даже когда сайт закрыт."
              : "Как только выйдет серия того, что вы смотрите, придёт уведомление — даже когда сайт закрыт. Без регистрации."}
          </DialogDescription>

          {/* What it will look like. */}
          <div className="push-preview mx-auto mt-5 flex max-w-xs items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-2.5 text-left shadow-lg backdrop-blur">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/20 font-display text-lg text-primary">影</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">AnimeShadow</span>
                сейчас
              </span>
              <span className="block truncate text-sm font-semibold">Магическая битва</span>
              <span className="block truncate text-xs text-muted-foreground">Вышла 12 серия — смотреть на AnimeShadow</span>
            </span>
          </div>
        </div>

        <ul className="grid gap-2 px-6 pb-5 text-sm">
          {[
            { icon: ZapIcon, text: "В момент выхода — не нужно проверять сайт" },
            { icon: PlayIcon, text: "Нажали — и сразу на нужной серии" },
            { icon: CalendarClockIcon, text: "Только то, что вы смотрите, без рекламы" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.04] px-3 py-2">
              <Icon className="size-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t border-border/60 p-4 sm:flex-row-reverse">
          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-transform active:scale-95 disabled:opacity-60",
            )}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
            Включить уведомления
          </button>
          <button type="button" onClick={later} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Не сейчас
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
