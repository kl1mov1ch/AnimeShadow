import type { PartyMember, PartySettings, PartyVisibility } from "@animeshadow/shared";
import { CrownIcon, Loader2Icon, MicOffIcon, MessageSquareIcon, MoonIcon, SlidersHorizontalIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VISIBILITY } from "./visibility";

export type LineQuality = "good" | "fair" | "poor" | "unknown";

export function lineQuality(mbps: number | null): LineQuality {
  if (mbps == null) return "unknown";
  return mbps >= 2.4 ? "good" : mbps >= 1.2 ? "fair" : "poor";
}

const QUALITY: Record<LineQuality, { label: string; tone: string; bars: number }> = {
  good: { label: "Хорошая связь", tone: "bg-emerald-400", bars: 4 },
  fair: { label: "Средняя связь", tone: "bg-amber-400", bars: 2 },
  poor: { label: "Слабая связь", tone: "bg-rose-400", bars: 1 },
  unknown: { label: "Ещё не измерено", tone: "bg-muted-foreground/40", bars: 0 },
};

/** A member's line as signal bars, coloured by how it does. */
export function SignalBars({ mbps, className }: { mbps: number | null; className?: string }) {
  const q = QUALITY[lineQuality(mbps)];
  return (
    <span title={mbps != null ? `${q.label} · ${mbps.toFixed(1)} Мбит/с` : q.label} className={cn("inline-flex h-3 items-end gap-[2px]", className)}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-sm", i <= q.bars ? q.tone : "bg-foreground/15")} style={{ height: `${i * 25}%` }} />
      ))}
    </span>
  );
}

type Filter = "all" | LineQuality;

/**
 * The host's room: who sees it, what the chat allows (stickers, GIFs,
 * reactions), who controls playback — and everyone in it, with their line,
 * filterable by how it does, and a mute for each.
 */
export function HostPanel({
  code,
  settings,
  members,
  onClose,
}: {
  code: string;
  settings: PartySettings;
  members: PartyMember[];
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const set = (patch: Partial<PartySettings>) =>
    void apiRequest(`/party/${code}/settings`, { method: "PATCH", body: patch }).catch(() => toast.error("Не получилось поменять"));
  const mute = (m: PartyMember) =>
    void apiRequest(`/party/${code}/mute`, { method: "POST", body: { userId: m.id, muted: !m.muted } }).catch(() => toast.error("Не получилось"));

  const shown = members.filter((m) => filter === "all" || lineQuality(m.mbps) === filter);
  const counts = (q: LineQuality) => members.filter((m) => lineQuality(m.mbps) === q).length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-lg">
        <DialogTitle className="flex items-center gap-2 font-display text-lg">
          <SlidersHorizontalIcon className="size-5 text-primary" />
          Управление комнатой
        </DialogTitle>
        <DialogDescription className="-mt-1 text-xs">Видно и доступно только вам — создателю.</DialogDescription>

        <section className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Кто видит комнату</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(VISIBILITY) as PartyVisibility[]).map((v) => {
              const V = VISIBILITY[v];
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => set({ visibility: v })}
                  title={V.hint}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-colors",
                    settings.visibility === v ? "border-primary/50 bg-primary/10 text-primary" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
                  )}
                >
                  <V.icon className="size-4" />
                  {V.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* One tap: nothing but the anime — no reactions, stickers, GIFs, chatter or waiting. */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set({ reactions: false, stickers: false, gifs: false, systemMessages: false, waitForSlow: false })}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium transition-colors hover:border-foreground/30"
          >
            <MoonIcon className="size-3.5" />
            Тихий режим — только аниме
          </button>
          <button
            type="button"
            onClick={() => set({ reactions: true, stickers: true, gifs: true, systemMessages: true, waitForSlow: true, capQuality: true, autoNext: true })}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium transition-colors hover:border-foreground/30"
          >
            <SparklesIcon className="size-3.5" />
            Всё включить
          </button>
        </div>

        <section className="flex flex-col divide-y divide-[var(--accent-line-soft)] rounded-xl border border-[var(--accent-line-soft)]">
          {(
            [
              ["allControl", "Управлять могут все", "Пауза, перемотка и серии — у всех. Иначе только у вас."],
              ["waitForSlow", "Ждать тех, у кого грузится", "Пауза у всех, пока у кого-то подгружается серия"],
              ["capQuality", "Качество по самому медленному", "Всем одинаковое качество — чтобы никто не отставал"],
              ["autoNext", "Автопереход", "В конце серии включается следующая (или самое желанное из очереди)"],
              ["systemMessages", "Служебные сообщения", "«Аня поставила паузу», «Олег вошёл» в чате"],
              ["reactions", "Реакции", "Эмодзи, которые всплывают поверх видео"],
              ["stickers", "Стикеры в чате", "Анимированные стикеры (для PRO)"],
              ["gifs", "Гифки в чате", "Гифки из библиотеки сайта (для PRO)"],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
              <Switch checked={settings[key]} onCheckedChange={(v) => set({ [key]: v })} />
            </label>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Участники · связь</p>
            <div className="ml-auto flex gap-1">
              {(
                [
                  ["all", "Все", members.length],
                  ["good", "Хорошая", counts("good")],
                  ["fair", "Средняя", counts("fair")],
                  ["poor", "Слабая", counts("poor")],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                    filter === id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label} <span className="tabular-nums opacity-60">{n}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="flex flex-col gap-1">
            {shown.length === 0 && <li className="py-4 text-center text-xs text-muted-foreground">Никого с такой связью</li>}
            {shown.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 rounded-xl bg-foreground/[0.03] px-2.5 py-2">
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                  {m.avatarUrl ? <img src={imageSrc(m.avatarUrl)} alt="" className="size-full object-cover" /> : m.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {m.name}
                    {m.host && <CrownIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                    {m.muted && <MicOffIcon className="size-3.5 shrink-0 text-rose-400" />}
                    {m.loading && <Loader2Icon className="size-3.5 shrink-0 animate-spin text-amber-400" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {m.loading ? "Грузится · " : ""}
                    {QUALITY[lineQuality(m.mbps)].label}
                    {m.mbps != null && ` · ${m.mbps.toFixed(1)} Мбит/с`}
                  </span>
                </span>
                <SignalBars mbps={m.mbps} className="h-3.5" />
                {!m.host && (
                  <button
                    type="button"
                    onClick={() => mute(m)}
                    title={m.muted ? "Разрешить писать" : "Запретить писать в чат"}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors",
                      m.muted ? "bg-rose-500/15 text-rose-400" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                    )}
                  >
                    {m.muted ? <MessageSquareIcon className="size-3.5" /> : <MicOffIcon className="size-3.5" />}
                    {m.muted ? "Вернуть" : "Заглушить"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
