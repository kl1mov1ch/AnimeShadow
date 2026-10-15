import type { AdminPartyAction, AdminPartyRoom, PartyMember, PartySettings } from "@animeshadow/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ClockIcon,
  CrownIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MegaphoneIcon,
  MessageSquareIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  SendIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  TvIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyBlock, LiveDot, Panel, UserAvatar } from "@/components/admin/admin-ui";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SignalBars } from "@/components/party/host-panel";
import { VISIBILITY } from "@/components/party/visibility";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU");
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min} мин`);
const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(t % 60).padStart(2, "0")}`;
};
const ago = (at: number, now: number) => {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  return min < 1 ? "только что" : hm(min);
};

/**
 * Watching together, for the site's admin: every room open right now —
 * who's in, what's on, how their lines do — with the levers (pause, a word
 * to the room, a message taken down, someone put out, the room's switches,
 * the room closed), and below it the sessions of the last weeks.
 */
export function AdminPartiesTab() {
  return (
    <div className="flex flex-col gap-5">
      <LiveRooms />
      <PartyStatsPanel />
    </div>
  );
}

// ---- live rooms ------------------------------------------------------------------

function useRoomAction(code: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: AdminPartyAction) => apiRequest(`/admin/parties/${code}/action`, { method: "POST", body: action }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["admin", "parties"] }),
    onError: (error) => toast.error(error instanceof ApiRequestError ? error.message : "Не получилось"),
  });
}

function LiveRooms() {
  const { data, isPending } = useQuery({
    queryKey: ["admin", "parties"],
    queryFn: ({ signal }) => apiRequest<{ rooms: AdminPartyRoom[]; now: number }>("/admin/parties", { signal }),
    // Rooms change by the second; the list follows every few.
    refetchInterval: 5_000,
  });
  const rooms = data?.rooms ?? [];
  const people = rooms.reduce((n, r) => n + r.members.length, 0);
  return (
    <Panel
      title="Комнаты сейчас"
      description="Обновляется каждые 5 секунд. Закрытая комната исчезает для всех сразу."
      icon={<TvIcon />}
      action={
        data && (
          <span className="inline-flex items-center gap-2 rounded-full bg-foreground/[0.05] px-3 py-1 text-xs tabular-nums">
            {people > 0 && <LiveDot />}
            {rooms.length} комн. · {people} чел.
          </span>
        )
      }
    >
      {isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : rooms.length === 0 ? (
        <EmptyBlock>Сейчас ни одной комнаты.</EmptyBlock>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {rooms.map((room) => (
            <RoomRow key={room.code} room={room} now={data?.now ?? Date.now()} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RoomRow({ room, now }: { room: AdminPartyRoom; now: number }) {
  const act = useRoomAction(room.code);
  const [open, setOpen] = useState<null | "chat" | "settings">(null);
  const [say, setSay] = useState("");
  const [closing, setClosing] = useState(false);
  const [kick, setKick] = useState<PartyMember | null>(null);
  const V = VISIBILITY[room.settings.visibility];
  const title = room.anime.titleLocalized || room.anime.title;

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--accent-line-soft)] bg-background/40 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {room.anime.imageUrl && <img src={imageSrc(room.anime.imageUrl, 240)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={title}>
            {title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-foreground/85">
              {room.playing ? <PlayIcon className="size-3 fill-current text-emerald-400" /> : <PauseIcon className="size-3" />}
              {room.episode} серия · {clock(room.position)}
            </span>
            <span className="inline-flex items-center gap-1">
              <V.icon className="size-3" />
              {V.label}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" />
              {ago(room.createdAt, now)}
            </span>
            <span className="font-mono">{room.code}</span>
          </p>
          {room.waitingFor && (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400">
              <Loader2Icon className="size-3 animate-spin" />
              ждут: {room.waitingFor}
            </p>
          )}
        </div>
        <Link
          to={`/party/${room.code}`}
          target="_blank"
          title="Открыть комнату"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <ExternalLinkIcon className="size-4" />
        </Link>
      </div>

      {/* Who's in. */}
      <div className="flex flex-wrap gap-1.5">
        {room.members.length === 0 && <span className="text-[11px] text-muted-foreground">Пусто{room.emptySince ? ` ${ago(room.emptySince, now)}` : ""} — закроется сама через 10 мин</span>}
        {room.members.map((m) => (
          <span key={m.id} className="group inline-flex max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.05] py-0.5 pl-0.5 pr-1 text-[11px]">
            <UserAvatar name={m.name} url={m.avatarUrl} className="size-5" />
            <span className="max-w-28 truncate">{m.name}</span>
            {m.host && <CrownIcon className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
            {m.loading ? <Loader2Icon className="size-3 shrink-0 animate-spin text-amber-400" /> : <SignalBars mbps={m.mbps} />}
            {!m.host && (
              <button
                type="button"
                onClick={() => setKick(m)}
                title="Убрать из комнаты"
                className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-400"
              >
                <UserXIcon className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          ["Сообщений", room.messages],
          ["Реакций", room.reactions],
          ["В очереди", room.queue],
          ["Пик", room.peak],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg bg-foreground/[0.03] px-1 py-1.5">
            <p className="font-display text-sm tabular-nums">{fmt(n as number)}</p>
            <p className="truncate text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* A word to the room. */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!say.trim()) return;
          act.mutate({ action: "say", text: say.trim() }, { onSuccess: () => setSay("") });
        }}
      >
        <span className="relative min-w-0 flex-1">
          <MegaphoneIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={say}
            onChange={(e) => setSay(e.target.value)}
            maxLength={300}
            placeholder="Объявление в чат комнаты…"
            className="h-9 w-full rounded-lg border border-[var(--accent-line-soft)] bg-background/60 pl-8 pr-2 text-xs outline-none focus:border-primary/50"
          />
        </span>
        <button
          type="submit"
          disabled={!say.trim() || act.isPending}
          aria-label="Отправить объявление"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        >
          <SendIcon className="size-3.5" />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        <ToolButton active={open === "chat"} onClick={() => setOpen(open === "chat" ? null : "chat")} icon={MessageSquareIcon}>
          Чат
          <ChevronDownIcon className={cn("size-3 transition-transform", open === "chat" && "rotate-180")} />
        </ToolButton>
        <ToolButton active={open === "settings"} onClick={() => setOpen(open === "settings" ? null : "settings")} icon={SlidersHorizontalIcon}>
          Настройки
          <ChevronDownIcon className={cn("size-3 transition-transform", open === "settings" && "rotate-180")} />
        </ToolButton>
        {room.playing && (
          <ToolButton onClick={() => act.mutate({ action: "pause" })} icon={PauseIcon}>
            Пауза
          </ToolButton>
        )}
        <button
          type="button"
          onClick={() => setClosing(true)}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-500/12 px-2.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500 hover:text-white"
        >
          <PowerIcon className="size-3.5" />
          Закрыть
        </button>
      </div>

      {open === "chat" && <RoomChat room={room} onDelete={(id) => act.mutate({ action: "unchat", messageId: id })} />}
      {open === "settings" && <RoomSettings code={room.code} settings={room.settings} />}

      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        title="Закрыть комнату?"
        description={`«${title}» закроется у всех ${room.members.length ? `(${room.members.length} чел.)` : ""} — они увидят, что её закрыла администрация.`}
        confirmLabel="Закрыть"
        pending={act.isPending}
        onConfirm={() => act.mutate({ action: "close" }, { onSuccess: () => setClosing(false) })}
      />
      <ConfirmDialog
        open={kick != null}
        onOpenChange={(v) => !v && setKick(null)}
        title={`Убрать ${kick?.name ?? ""}?`}
        description="Человек выйдет из комнаты и не сможет вернуться в неё."
        confirmLabel="Убрать"
        pending={act.isPending}
        onConfirm={() => kick && act.mutate({ action: "kick", userId: kick.id }, { onSuccess: () => setKick(null) })}
      />
    </li>
  );
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  icon: typeof PauseIcon;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function RoomChat({ room, onDelete }: { room: AdminPartyRoom; onDelete: (id: string) => void }) {
  const said = room.chat.filter((m) => m.author);
  if (said.length === 0) return <p className="rounded-lg bg-foreground/[0.03] p-3 text-center text-xs text-muted-foreground">Никто ещё ничего не написал.</p>;
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain rounded-lg bg-foreground/[0.03] p-2">
      {said.map((m) => (
        <li key={m.id} className="group flex items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-foreground/[0.04]">
          <span className="shrink-0 font-semibold">{m.author!.name}:</span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {m.kind === "sticker" ? <i className="text-muted-foreground">стикер</i> : m.kind === "gif" ? <i className="text-muted-foreground">гифка</i> : m.text}
          </span>
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {new Date(m.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            type="button"
            onClick={() => onDelete(m.id)}
            title="Удалить сообщение у всех"
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-400"
          >
            <Trash2Icon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RoomSettings({ code, settings }: { code: string; settings: PartySettings }) {
  const client = useQueryClient();
  const set = (patch: Partial<PartySettings>) =>
    void apiRequest(`/admin/parties/${code}/settings`, { method: "PATCH", body: patch })
      .then(() => client.invalidateQueries({ queryKey: ["admin", "parties"] }))
      .catch(() => toast.error("Не получилось поменять"));
  return (
    <div className="grid gap-x-4 gap-y-1 rounded-lg bg-foreground/[0.03] p-2 sm:grid-cols-2">
      {(
        [
          ["allControl", "Управляют все"],
          ["waitForSlow", "Ждать тех, у кого грузится"],
          ["capQuality", "Качество по самому медленному"],
          ["autoNext", "Автопереход"],
          ["systemMessages", "Служебные сообщения"],
          ["reactions", "Реакции"],
          ["stickers", "Стикеры"],
          ["gifs", "Гифки"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-2 px-1 py-1.5 text-xs">
          {label}
          <Switch checked={settings[key]} onCheckedChange={(v) => set({ [key]: v })} />
        </label>
      ))}
    </div>
  );
}

// ---- statistics --------------------------------------------------------------------

interface PartyStats {
  days: number;
  sessions: number;
  viewers: number;
  minutes: number;
  live: { rooms: number; people: number; open: number; peak: number; peakAt: number | null };
  avgMinutes: number;
  avgPeople: number;
  messages: number;
  reactions: number;
  byDay: Array<{ day: string; sessions: number; minutes: number; viewers: number }>;
  hours: number[];
  reasons: Array<{ reason: string; count: number }>;
  titles: Array<{ id: number; title: string; sessions: number; viewers: number }>;
  people: Array<{ id: string; name: string; minutes: number; episodes: number; sessions: number }>;
  recent: Array<{ code: string; endedAt: string; minutes: number; reason: string; titles: Array<{ title: string }>; people: Array<{ name: string; minutes: number; episodes: number }> }>;
}

/**
 * Sessions over the last weeks: rooms leave nothing behind but a line in the
 * log when they close — who watched how long and how many episodes, of what.
 */
function PartyStatsPanel() {
  const [days, setDays] = useState(30);
  const { data, isPending } = useQuery({
    queryKey: ["admin", "party-stats", days],
    queryFn: ({ signal }) => apiRequest<PartyStats>("/admin/party-stats", { signal, query: { days } }),
    refetchInterval: 60_000,
  });
  return (
    <Panel
      title="Статистика комнат"
      description="По журналу закрытых комнат. Сами комнаты и чаты не хранятся."
      icon={<UsersIcon />}
      action={
        <div className="flex gap-1 rounded-lg bg-foreground/[0.05] p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors", days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {d} дн.
            </button>
          ))}
        </div>
      }
    >
      {isPending || !data ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Сессий", value: fmt(data.sessions) },
              { label: "Зрителей", value: fmt(data.viewers) },
              { label: "Просмотрено вместе", value: hm(data.minutes) },
              { label: "Сейчас: комнат · людей", value: `${data.live.rooms} · ${data.live.people}`, live: data.live.people > 0 },
              { label: "Средняя сессия", value: hm(data.avgMinutes) },
              { label: "Человек в комнате", value: String(data.avgPeople).replace(".", ",") },
              { label: "Сообщений · реакций", value: `${fmt(data.messages)} · ${fmt(data.reactions)}` },
              {
                label: data.live.peakAt
                  ? `Пик онлайн, ${new Date(data.live.peakAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                  : "Пик онлайн с запуска",
                value: `${data.live.peak} чел.`,
              },
            ].map((k) => (
              <div key={k.label} className="min-w-0 rounded-xl border border-border/50 bg-background/30 p-3">
                <p className="flex items-center gap-1.5 truncate font-display text-base tabular-nums sm:text-xl">
                  {k.live && <LiveDot />}
                  {k.value}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>

          {data.sessions === 0 ? (
            <EmptyBlock>Пока ни одной сессии дольше полуминуты.</EmptyBlock>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Bars
                  title="Сессий по дням"
                  values={data.byDay.map((d) => d.sessions)}
                  labels={data.byDay.map((d) => new Date(d.day).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }))}
                  hint={(i) => `${data.byDay[i]!.sessions} сес. · ${data.byDay[i]!.viewers} чел. · ${hm(data.byDay[i]!.minutes)}`}
                />
                <Bars title="Когда начинают (МСК)" values={data.hours} labels={data.hours.map((_, h) => `${h}:00`)} hint={(i) => `${i}:00 — ${data.hours[i]} сес.`} />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <List title="Что смотрят" rows={data.titles.map((t) => [t.title, `${t.sessions} сес.`, `${t.viewers} чел.`])} />
                <List title="Кто больше смотрит" rows={data.people.map((p) => [p.name, hm(p.minutes), `${p.episodes} сер.`])} />
                <List title="Почему закрываются" rows={data.reasons.map((r) => [r.reason, `${r.count}`, `${Math.round((r.count / data.sessions) * 100)}%`])} />
                <List
                  title="Последние сессии"
                  rows={data.recent.map((s) => [
                    `${s.titles.map((t) => t.title).join(", ")} · ${new Date(s.endedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
                    `${s.people.length} чел.`,
                    hm(s.people.reduce((n, p) => n + p.minutes, 0)),
                  ])}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

/** One measure as thin columns, a tooltip on each; the busiest one labelled. */
function Bars({ title, values, labels, hint }: { title: string; values: number[]; labels: string[]; hint: (i: number) => string }) {
  const max = Math.max(1, ...values);
  const top = values.indexOf(Math.max(...values));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-xs font-semibold">{title}</p>
      <div className="relative flex h-32 items-end gap-[2px] border-b border-border/60">
        {values.map((v, i) => (
          <span key={i} title={`${labels[i]}: ${hint(i)}`} className="group relative flex h-full min-w-0 flex-1 items-end">
            <span
              className={cn("w-full rounded-t-[4px] transition-colors", v ? "bg-primary/70 group-hover:bg-primary" : "bg-foreground/[0.06]")}
              style={{ height: v ? `${Math.max(4, (v / max) * 100)}%` : "2px" }}
            />
            {i === top && v > 0 && (
              <span className="pointer-events-none absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full text-[10px] font-semibold tabular-nums text-foreground">
                {v}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: Array<[string, string, string]> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-xs font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Пока нет данных</p>
      ) : (
        rows.slice(0, 10).map(([name, a, b], i) => (
          <div key={`${name}-${i}`} className="flex items-center gap-2 rounded-lg bg-foreground/[0.03] px-2.5 py-1.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate" title={name}>
              {name}
            </span>
            <span className="shrink-0 tabular-nums">{a}</span>
            {b && <span className="shrink-0 tabular-nums text-muted-foreground">{b}</span>}
          </div>
        ))
      )}
    </div>
  );
}
