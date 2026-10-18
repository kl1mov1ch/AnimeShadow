import { LogoGlyph } from "@/components/brand/logo-glyph";
import { LockIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRef, useState } from "react";

/** Opened only by intent; no toast interrupts a guest's ordinary viewing. */
export function MemberFeature({ label, className }: { label: string; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const owner = trigger.current?.ownerDocument;
  const container = (owner?.fullscreenElement ?? trigger.current?.closest("[data-animeshadow-player]") ?? owner?.body) as HTMLElement | undefined;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button ref={trigger} type="button" className={className ?? "flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-white/65 hover:bg-white/10"}>
        <LockIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent portalContainer={container} className="w-64 max-w-[calc(100vw-1.5rem)] text-sm" side="top">
      <p className="flex items-center gap-2 font-semibold"><LogoGlyph className="size-5 shrink-0 text-primary" />{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">Доступно бесплатно после регистрации. Ваши настройки сохранятся между сериями.</p>
      <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground"><li>Продолжение с сохранённой минуты</li><li>Любимая озвучка и настройки просмотра</li><li>Список аниме и уведомления о сериях</li></ul>
      <Link to="/register" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Зарегистрироваться</Link>
    </PopoverContent>
  </Popover>;
}
