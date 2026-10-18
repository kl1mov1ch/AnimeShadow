import type { MobileNavigationItem } from "@animeshadow/shared";
import type { ReactNode } from "react";
import { NAVIGATION_ITEMS } from "@/lib/navigation-items";
import { cn } from "@/lib/utils";

export function NavigationBar({ buttons, active, onSearch, onSelect, renderItem, label = "Мобильная навигация" }: {
  buttons: MobileNavigationItem[]; active: string | null; onSearch: () => void;
  onSelect?: (item: MobileNavigationItem) => void;
  renderItem?: (id: MobileNavigationItem, selected: boolean, className: string, children: ReactNode) => ReactNode;
  label?: string;
}) {
  const buttonClass = (selected: boolean) => cn("flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary active:bg-secondary", selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground");
  const item = (id: MobileNavigationItem) => {
    const { icon: Icon, label, short } = NAVIGATION_ITEMS[id];
    const selected = active === id;
    const className = buttonClass(selected);
    const children = <><Icon aria-hidden className="size-5 shrink-0" strokeWidth={selected ? 2.2 : 1.8} /><span className="block max-w-full truncate px-0.5 text-[10px] font-medium leading-3">{short}</span></>;
    return <div key={id} className="min-w-0">{id === "search" ? <button type="button" aria-label="Поиск аниме" aria-haspopup="dialog" onClick={onSearch} className={className}>{children}</button> : renderItem ? renderItem(id, selected, className, children) : <button type="button" aria-label={label} aria-pressed={selected} className={className} onClick={() => onSelect?.(id)}>{children}</button>}</div>;
  };
  return <nav aria-label={label} className="grid h-16 w-full grid-cols-5 items-stretch gap-1 px-2 py-1">
    {buttons.map(item)}
  </nav>;
}
