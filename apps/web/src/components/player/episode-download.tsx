import { PROMO } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, GiftIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useClaimPromo, useIsPro, usePromo } from "@/components/promo/promo-offer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiRequestError } from "@/lib/api";

export function EpisodeDownload({
  animeId,
  sourceId,
  episode,
  quality,
  available,
}: {
  animeId: number;
  sourceId: string;
  episode: number;
  quality: string;
  available: boolean;
}) {
  const { status } = useAuth();
  const pro = useIsPro();
  const promo = usePromo();
  const claim = useClaimPromo();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparedBytes, setPreparedBytes] = useState(0);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  const guest = status !== "authenticated";
  const download = async () => {
    if (!available) {
      toast.info("Дождитесь загрузки серии в своём плеере.");
      return;
    }
    setBusy(true);
    setPreparedBytes(0);
    const controller = new AbortController();
    preparation.current = controller;
    try {
      const file = await apiRequest<{
        url: string;
        statusUrl: string;
        filename: string;
      }>(`/anime/${animeId}/download`, {
        method: "POST",
        signal: controller.signal,
        body: {
          sourceId,
          episode,
          ...(quality !== "auto" ? { height: Number(quality) } : {}),
        },
      });
      const started = Date.now();
      while (true) {
        const progress = await apiRequest<{
          state: "preparing" | "ready" | "failed";
          bytes: number;
          message?: string;
        }>(file.statusUrl.replace(/^\/api/, ""), { signal: controller.signal });
        setPreparedBytes(progress.bytes);
        if (progress.state === "failed")
          throw new Error(progress.message ?? "Не удалось подготовить серию.");
        if (progress.state === "ready") break;
        if (Date.now() - started > 21 * 60_000)
          throw new Error(
            "Подготовка заняла слишком много времени. Повторите попытку.",
          );
        await new Promise<void>((resolve, reject) => {
          const cancelled = () => {
            clearTimeout(timer);
            reject(new Error("Cancelled"));
          };
          const timer = setTimeout(() => {
            controller.signal.removeEventListener("abort", cancelled);
            resolve();
          }, 3000);
          controller.signal.addEventListener("abort", cancelled, { once: true });
          if (controller.signal.aborted) cancelled();
        });
      }
      controller.signal.throwIfAborted();
      const link = document.createElement("a");
      link.href = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") + file.url;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      toast.success("Серия готова. Скачивание началось.");
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(
        error instanceof Error ? error.message : "Не удалось начать скачивание",
      );
      if (error instanceof ApiRequestError && error.status === 403)
        void queryClient.invalidateQueries({ queryKey: ["me", "promo"] });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <span className="inline-flex shrink-0 flex-col items-end gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Скачать серию"
            disabled={busy || (status === "authenticated" && promo.isPending)}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 hover:bg-primary/15 disabled:opacity-60"
            onClick={(event) => {
              if (pro) {
                event.preventDefault();
                void download();
              }
            }}
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <DownloadIcon className="size-3.5" />
            )}
            <span>{busy ? "Готовим серию…" : "Скачать серию"}</span>
            {!pro && (
              <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] leading-none text-primary">
                PRO
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          collisionPadding={12}
          className="w-72 max-w-[calc(100vw-1.5rem)] p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold">
            <GiftIcon className="size-4 text-primary" />
            Сохрани серию с PRO
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Скачивай серии в MP4 с выбранной озвучкой и смотри без интернета.
          </p>
          {guest ? (
            <>
              <p className="mt-3 text-sm font-medium">
                {PROMO.trialDays} дней PRO бесплатно при регистрации
              </p>
              <Link
                to="/register"
                className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                Получить бесплатный PRO
              </Link>
              <Link
                to="/login"
                className="mt-2 block py-2 text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Уже есть аккаунт? Войти
              </Link>
            </>
          ) : promo.data?.phase === "claimable" ? (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Тебе доступен подарок: {PROMO.trialDays} дней PRO бесплатно.
              </p>
              <button
                type="button"
                disabled={claim.isPending}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                onClick={() =>
                  claim.mutate(undefined, {
                    onSuccess: () => {
                      setOpen(false);
                      toast.success(`PRO включён на ${PROMO.trialDays} дней!`);
                    },
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                Забрать {PROMO.trialDays} дней PRO
              </button>
            </>
          ) : (
            <Link
              to="/support"
              className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              Включить PRO
            </Link>
          )}
        </PopoverContent>
      </Popover>
      {busy && (
        <span className="text-[10px] leading-tight text-muted-foreground" role="status">
          {preparedBytes > 0
            ? `Подготовлено ${Math.ceil(preparedBytes / 1024 / 1024)} МБ`
            : "Проверяем источник…"}
        </span>
      )}
      {guest && (
        <Link
          to="/register"
          className="text-[9px] leading-tight text-primary/85 hover:text-primary"
        >
          {PROMO.trialDays} дней PRO в подарок
        </Link>
      )}
    </span>
  );
}
