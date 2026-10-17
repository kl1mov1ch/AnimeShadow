import type { MobileNavigationItem } from "@animeshadow/shared";
import { SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import { NAVIGATION_ITEMS } from "@/lib/navigation-items";
import { cn } from "@/lib/utils";

export function NavigationBar({ buttons, active, onSearch, onSelect, renderItem, label = "Мобильная навигация" }: {
  buttons: MobileNavigationItem[]; active: string | null; onSearch: () => void;
  onSelect?: (item: MobileNavigationItem) => void;
  renderItem?: (id: MobileNavigationItem, selected: boolean, className: string, children: ReactNode) => ReactNode;
  label?: string;
}) {
  const buttonClass = (selected: boolean) => cn("group relative inline-flex h-11 min-w-10 items-center justify-center rounded-xl px-2.5 outline-none transition-[background-color,color,transform] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none", selected ? "min-w-0 bg-primary/10 text-primary" : "shrink-0 text-muted-foreground hover:bg-secondary hover:text-foreground");
  const item = (id: MobileNavigationItem) => {
    const { icon: Icon, label, short } = NAVIGATION_ITEMS[id];
    const selected = active === id;
    const className = buttonClass(selected);
    const children = <><Icon aria-hidden className="size-[18px] shrink-0 transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none" strokeWidth={selected ? 2.2 : 1.8} /><span aria-hidden className={cn("overflow-hidden text-left text-[11px] font-semibold transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none", selected ? "ml-1.5 max-w-16 opacity-100" : "ml-0 max-w-0 opacity-0")}><span className="block truncate whitespace-nowrap">{short}</span></span></>;
    return <span key={id} className={cn("flex", selected ? "min-w-0" : "shrink-0")}>{renderItem ? renderItem(id, selected, className, children) : <button type="button" aria-label={label} aria-pressed={selected} className={className} onClick={() => onSelect?.(id)}>{children}</button>}</span>;
  };
  return <nav aria-label={label} className="mx-auto flex h-14 w-max max-w-full items-center justify-center gap-1 px-1.5">
    {buttons.slice(0, 2).map(item)}
    <button type="button" aria-label="Поиск аниме" aria-haspopup="dialog" onClick={onSearch} className={buttonClass(active === "search")}><SearchIcon aria-hidden className="size-[18px] shrink-0 transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none" /><span aria-hidden className={cn("overflow-hidden text-[11px] font-semibold transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none", active === "search" ? "ml-1.5 max-w-12 opacity-100" : "ml-0 max-w-0 opacity-0")}>Поиск</span></button>
    {buttons.slice(2).map(item)}
  </nav>;
}
