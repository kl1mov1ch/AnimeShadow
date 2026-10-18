import { BookmarkIcon, HistoryIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { useAuth } from "@/hooks/use-auth";
import { AccountPreview } from "./account-preview";

/** Invitation below the player: never covers video and closes in a single action. */
export function GuestPlayerBanner() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [closedOn, setClosedOn] = useState<string | null>(null);
  if (status !== "anonymous" || closedOn === pathname) return null;
  return <aside aria-label="Сохранение прогресса" className="relative rounded-2xl border border-primary/20 bg-card p-3 sm:p-4">
    <button type="button" onClick={() => setClosedOn(pathname)} aria-label="Закрыть приглашение" className="absolute right-1 top-1 grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-secondary"><XIcon className="size-4" /></button>
    <div className="flex items-center gap-3 pr-8">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LogoGlyph className="size-7" /></span>
      <div className="min-w-0"><p className="text-sm font-semibold">Продолжай с того же места</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Бесплатный аккаунт сохранит твой аниме-вечер.</p></div>
    </div>
    <ul className="my-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground"><li className="flex items-center gap-1.5"><HistoryIcon className="size-3.5" />Серия и минута просмотра</li><li className="flex items-center gap-1.5"><BookmarkIcon className="size-3.5" />Список и оценки</li></ul>
    <details className="my-3"><summary className="cursor-pointer text-xs text-primary">Посмотреть, как это работает</summary><div className="mt-3"><AccountPreview compact /></div></details>
    <div className="flex gap-2"><Link to="/register" state={{ from: pathname }} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/85 sm:flex-none">Создать аккаунт</Link><Link to="/login" state={{ from: pathname }} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm hover:bg-secondary">Войти</Link></div>
  </aside>;
}
