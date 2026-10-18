import { DEFAULT_MOBILE_NAVIGATION, normalizeMobileNavigation, replaceNavigationItem, type MobileNavigationItem } from "@animeshadow/shared";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { NavigationBar } from "@/components/layout/navigation-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMobileNavigation, useSaveMobileNavigation } from "@/lib/mobile-navigation";
import { NAVIGATION_ITEMS } from "@/lib/navigation-items";

export function NavigationSettings() {
  const preferences = useMobileNavigation();
  const save = useSaveMobileNavigation();
  const [draft, setDraft] = useState<MobileNavigationItem[] | null>(null);
  const [preview, setPreview] = useState<MobileNavigationItem | "search">("home");
  const prefix = useId();
  const buttons = normalizeMobileNavigation({ buttons: draft ?? preferences.data?.buttons ?? DEFAULT_MOBILE_NAVIGATION }).buttons;
  const changed = JSON.stringify(buttons) !== JSON.stringify(preferences.data?.buttons ?? DEFAULT_MOBILE_NAVIGATION);
  const activePreview = preview === "search" || buttons.includes(preview) ? preview : buttons[0]!;
  const current = activePreview === "search" ? null : NAVIGATION_ITEMS[activePreview];
  const PreviewIcon = current?.icon ?? SearchIcon;

  return <section className="flex min-w-0 flex-col gap-4" aria-label="Настройка мобильной навигации">
    <div><p className="text-sm font-medium">Твои разделы — под рукой</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Настрой пять кнопок. Поиск можно поменять местами с любой из них. Настройка бесплатна и сохраняется в аккаунте.</p></div>
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 bg-secondary/20 p-4 text-center" aria-live="polite">
        <PreviewIcon className="size-7 text-primary" />
        <p className="text-sm font-semibold">{current?.label ?? "Поиск аниме"}</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{activePreview === "notifications" ? "Здесь откроются уведомления о доступных сериях." : activePreview === "search" ? "Поиск по названиям, людям и подборкам." : "Все разделы видны сразу. Нажми на кнопку, чтобы проверить меню."}</p>
      </div>
      <div className="border-t border-border bg-card"><NavigationBar buttons={buttons} active={activePreview} onSelect={setPreview} onSearch={() => setPreview("search")} label="Предпросмотр нижнего меню" /></div>
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Интерактивный предпросмотр — кнопки можно нажимать, страница останется открытой.</p>
    {preferences.isError && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-xs"><p>Не удалось загрузить настройки. Сохранение пока недоступно.</p><button type="button" onClick={() => void preferences.refetch()} className="mt-2 min-h-9 text-primary">Повторить</button></div>}
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      {buttons.map((item, index) => <div key={index} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/70 bg-card p-3">
        <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Позиция {index + 1}</span><div className="flex gap-1">{([-1, 1] as const).map(direction => <button key={direction} type="button" disabled={index + direction < 0 || index + direction >= buttons.length || save.isPending || preferences.isPending || preferences.isError} aria-label={`${direction < 0 ? "Переместить влево" : "Переместить вправо"}: ${NAVIGATION_ITEMS[item].label}`} onClick={() => { setDraft(replaceNavigationItem(buttons, index, buttons[index + direction]!)); setPreview(item); }} className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary disabled:opacity-25">{direction < 0 ? <ArrowLeftIcon className="size-3.5" /> : <ArrowRightIcon className="size-3.5" />}</button>)}</div></div>
        <label htmlFor={`${prefix}-${index}`} className="text-xs font-medium text-muted-foreground">Кнопка {index + 1}{item === "search" ? " · можно переместить" : ""}</label>
        <Select value={item} disabled={save.isPending || preferences.isPending || preferences.isError} onValueChange={(value) => { setDraft(replaceNavigationItem(buttons, index, value as MobileNavigationItem)); setPreview(value as MobileNavigationItem); }}>
          <SelectTrigger id={`${prefix}-${index}`} className="min-h-11 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(NAVIGATION_ITEMS) as MobileNavigationItem[]).filter((id) => item !== "search" || buttons.includes(id)).map((id) => { const entry = NAVIGATION_ITEMS[id]; return <SelectItem key={id} value={id}><entry.icon className="size-4" />{entry.label}</SelectItem>; })}</SelectContent>
        </Select>
      </div>)}
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Если ярлык уже выбран, кнопки поменяются местами. На компьютере нижняя панель скрыта; настроить её можно здесь.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!changed || save.isPending || preferences.isPending || preferences.isError} onClick={() => save.mutate({ buttons }, { onSuccess: () => { setDraft(null); toast.success("Меню сохранено", { description: "Оно будет таким на твоих устройствах после входа." }); }, onError: () => toast.error("Не получилось сохранить меню. Попробуй ещё раз.") })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><CheckIcon className="size-4" />{save.isPending ? "Сохраняем…" : "Сохранить меню"}</button>
      <button type="button" disabled={save.isPending || preferences.isPending} onClick={() => { setDraft([...DEFAULT_MOBILE_NAVIGATION]); setPreview("home"); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs hover:bg-secondary disabled:opacity-50"><RotateCcwIcon className="size-4" />По умолчанию</button>
    </div>
  </section>;
}
