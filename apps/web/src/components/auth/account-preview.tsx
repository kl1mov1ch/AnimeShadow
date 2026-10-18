import { BellRingIcon, BookOpenIcon, CheckIcon, ListVideoIcon, Settings2Icon, TrophyIcon, UsersIcon } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "player", label: "Плеер", icon: ListVideoIcon },
  { id: "list", label: "Мой список", icon: BookOpenIcon },
  { id: "profile", label: "Профиль", icon: TrophyIcon },
  { id: "rooms", label: "Комнаты", icon: UsersIcon },
  { id: "notify", label: "Новые серии", icon: BellRingIcon },
] as const;

/** Local, clearly labelled examples. No account, stream or background requests. */
export function AccountPreview({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("player");
  const [episode, setEpisode] = useState(3);
  const [listed, setListed] = useState(false);
  const [vote, setVote] = useState(false);
  const [autoNext, setAutoNext] = useState(true);
  const id = useId();
  return <section aria-label="Пример возможностей аккаунта" className="min-w-0 rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
    <header className="mb-3 flex items-start gap-2"><LogoGlyph className="mt-0.5 size-5 shrink-0 text-primary"/><div><h2 className="text-sm font-semibold">Попробуй возможности аккаунта</h2><p className="mt-1 text-[11px] text-muted-foreground">Интерактивный пример. Эти действия не сохраняются.</p></div></header>
    <div role="tablist" aria-label="Возможности" className="flex flex-wrap gap-1.5">{TABS.map((entry,index) => <button key={entry.id} type="button" role="tab" id={`${id}-${entry.id}`} aria-selected={tab === entry.id} aria-controls={`${id}-panel`} tabIndex={tab === entry.id ? 0 : -1} onClick={() => setTab(entry.id)} onKeyDown={event => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!; setTab(next.id); document.getElementById(`${id}-${next.id}`)?.focus(); }} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium", tab === entry.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary")}><entry.icon className="size-3.5"/>{entry.label}</button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} className="mt-3 flex min-h-36 min-w-0 flex-col gap-3 rounded-xl bg-secondary/40 p-3 text-xs leading-relaxed">
      {tab === "player" && <><p className="font-medium">Продолжение: серия {episode}, 08:24</p><div className="grid grid-cols-4 gap-1.5">{[1,2,3,4].map(n => <button key={n} type="button" onClick={() => setEpisode(n)} aria-pressed={episode === n} className={cn("min-h-9 rounded-lg border", episode === n ? "border-primary bg-primary/15 text-primary" : "border-border")}>{n} серия</button>)}</div><button type="button" role="switch" aria-checked={autoNext} onClick={() => setAutoNext(!autoNext)} className="flex items-center gap-2 text-left"><span className={cn("grid size-5 place-items-center rounded border", autoNext && "border-primary bg-primary text-primary-foreground")}>{autoNext && <CheckIcon className="size-3"/>}</span>Следующая серия автоматически</button><p className="text-muted-foreground">Позиция, любимая озвучка, скорость и пропуск OP/ED сохраняются в аккаунте. 1080p и 2K — с PRO, если поддерживает устройство.</p></>}
      {tab === "list" && <><p className="font-medium">Своя библиотека без потерянных тайтлов</p><div className="flex flex-wrap gap-1.5"><span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-emerald-300">Смотрю</span><span className="rounded-lg bg-sky-400/10 px-2 py-1 text-sky-300">В планах</span><span className="rounded-lg bg-primary/10 px-2 py-1 text-primary">Просмотрено</span></div><button type="button" aria-pressed={listed} onClick={() => setListed(!listed)} className="min-h-10 rounded-lg border border-primary/30 px-3 text-primary">{listed ? "Добавлено в «В планах» ✓" : "Попробовать добавить в список"}</button><p className="text-muted-foreground">Оценки, личные заметки, поиск и фильтры по своей библиотеке.</p></>}
      {tab === "profile" && <><p className="flex items-center gap-2 font-medium"><TrophyIcon className="size-5 text-amber-300"/>Свой профиль и развитие</p><div className="h-2 rounded-full bg-border"><div className="h-full w-3/5 rounded-full bg-primary"/></div><p className="text-muted-foreground">Аватар, обложка, любимая пятёрка, активность по месяцам и витрина достижений. Приписки открываются за реальные действия.</p><p className="flex items-center gap-1.5"><Settings2Icon className="size-3.5"/>Пять кнопок нижнего меню можно настроить и переставить.</p></>}
      {tab === "rooms" && <><p className="font-medium">Синхронный просмотр и общий чат</p><button type="button" aria-pressed={vote} onClick={() => setVote(!vote)} className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-primary/30 px-3"><span>Следующая серия</span><span className="text-primary">{vote ? "Ваш голос · 4" : "Голосовать · 3"}</span></button><p className="text-muted-foreground">Вход и голосование в общих залах доступны всем. PRO предлагает тайтлы и серии и создаёт личные комнаты. Пустая комната ждёт на паузе.</p></>}
      {tab === "notify" && <><p className="flex items-center gap-2 font-medium"><BellRingIcon className="size-5 text-sky-300"/>Новая серия появилась на сайте</p><p className="text-muted-foreground">Уведомления по «Смотрю», «В планах» и «Отложено». Можно привязать свой Telegram через бота, отдельно от push браузера.</p><p>В настройках: открыть бота → нажать Start → аккаунт связан.</p></>}
    </div>
    {!compact && <div className="mt-3 flex flex-wrap gap-2"><Link to="/register" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground">Создать бесплатный аккаунт</Link><Link to="/login" className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-xs">Уже есть аккаунт</Link></div>}
  </section>;
}
