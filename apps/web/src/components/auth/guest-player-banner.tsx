import { HeartCrackIcon, SparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ReactionGif } from "@/components/common/reaction-gif";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { PerksList } from "./guest-nudge";
import { PromoStrip } from "@/components/promo/promo-offer";

/**
 * Above the player, for a guest: a bright strip saying what watching
 * without an account loses, with the way in. It sits over the player, never
 * inside it, so nothing gets in the way of the picture. Closing it doesn't
 * end the conversation — a small, sad window asks why they don't want to be
 * friends, and only "Не сейчас" there really lets it go (until the next
 * title).
 */
export function GuestPlayerBanner() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [closedOn, setClosedOn] = useState<string | null>(null);
  const [plea, setPlea] = useState(false);
  if (status !== "anonymous" || closedOn === pathname) return null;

  return (
    <>
      <div className="nudge-ring animate-in rounded-2xl p-px duration-500 fade-in-0 slide-in-from-top-2">
        <div className="relative overflow-hidden rounded-[calc(1rem-1px)] bg-[color-mix(in_srgb,var(--card)_94%,white_6%)]">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-8 -top-10 size-32 rounded-full bg-primary/25 blur-3xl"
          />
          <div className="relative flex items-center gap-3 p-3 pr-11 sm:gap-4 sm:p-3.5 sm:pr-12">
            <ReactionGif
              category="pout"
              className="nudge-bob relative size-12 shrink-0 rounded-xl sm:size-14"
            />
            <div className="relative flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-display text-[15px] leading-tight sm:text-base">
                Смотришь как гость — прогресс не сохранится
              </p>
              <p className="line-clamp-2 text-xs leading-snug text-foreground/75 sm:text-[13px]">
                С аккаунтом серия и минута запомнятся сами, а тайтл попадёт в твой
                список. Бесплатно, 20 секунд.
              </p>
            </div>
            <div className="relative hidden shrink-0 items-center gap-2 sm:flex">
              <Link
                to="/register"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-4 text-[13px] font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                <SparklesIcon className="size-3.5" />
                Создать аккаунт
              </Link>
              <Link
                to="/login"
                state={{ from: pathname }}
                className="inline-flex h-9 items-center rounded-xl border border-border/70 px-3 text-[13px] font-semibold transition-colors hover:border-foreground/30"
              >
                Войти
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setPlea(true)}
              aria-label="Закрыть"
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </div>
          <div className="relative px-3 pb-3 sm:px-3.5 sm:pb-3.5">
          <PromoStrip />
        </div>
        {/* A phone: the buttons get their own row. */}
          <div className="relative flex gap-2 px-3 pb-3 sm:hidden">
            <Link
              to="/register"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 text-[13px] font-bold text-white"
            >
              <SparklesIcon className="size-3.5" />
              Создать аккаунт
            </Link>
            <Link
              to="/login"
              state={{ from: pathname }}
              className="inline-flex h-9 items-center rounded-xl border border-border/70 px-4 text-[13px] font-semibold"
            >
              Войти
            </Link>
          </div>
        </div>
      </div>

      <Dialog
        open={plea}
        onOpenChange={(open) => {
          if (!open) {
            setPlea(false);
            setClosedOn(pathname);
          }
        }}
      >
        <DialogContent
          className="overflow-hidden sm:max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <div className="relative">
              <ReactionGif category="cry" className="size-28 shadow-xl" />
              <span className="absolute -bottom-2 -right-2 grid size-9 place-items-center rounded-full border border-primary/30 bg-card text-primary shadow-lg">
                <HeartCrackIcon className="size-4" />
              </span>
            </div>
            <DialogTitle className="font-display text-xl">
              Почему ты не хочешь дружить? 🥺
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-foreground/80">
              Мы же уже почти знакомы! Без аккаунта мы забудем, на какой серии ты
              остановился, и не сможем подсказать, что посмотреть дальше. А с ним — вот
              что тебя ждёт:
            </DialogDescription>
          </div>
          <PerksList className="relative text-left" />
          <PromoStrip className="relative" />
          <div className="relative flex flex-col gap-2 sm:flex-row">
            <Link
              to="/register"
              onClick={() => setPlea(false)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r sm:flex-1 from-primary via-rose-500 to-fuchsia-500 px-4 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
            >
              <SparklesIcon className="size-4" />
              Ладно, давай дружить!
            </Link>
            <button
              type="button"
              onClick={() => {
                setPlea(false);
                setClosedOn(pathname);
              }}
              className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Не сейчас 💔
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
