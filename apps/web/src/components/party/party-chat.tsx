import { PARTY_EMOJI, PARTY_MAX, PARTY_STICKERS, type PartyChatMessage, type PartyMember, type PartySettings, stickerStill, stickerUrl } from "@animeshadow/shared";
import { SignalBars } from "./host-panel";
import { Loader2Icon, CrownIcon, ImageIcon, LockIcon, MessageSquareIcon, SendIcon, SmileIcon, StickerIcon, WifiIcon } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ProMark } from "@/components/common/pro-mark";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { useGifLibrary } from "@/lib/gifs";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const gifUrl = (name: string) => `${API_BASE}/api/gifs/${name}`;
const gifStill = (name: string) => `${API_BASE}/api/gifs/${name}?still=1`;
const time = (at: number) => new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const GIF_LABELS: Record<string, string> = {
  happy: "Радость",
  laugh: "Смех",
  cry: "Слёзы",
  hug: "Обнимашки",
  wave: "Привет",
  smile: "Улыбка",
  blush: "Смущение",
  pout: "Обида",
  think: "Думаю",
  shrug: "Ну и",
  dance: "Танец",
  thumbsup: "Класс",
  facepalm: "Фейспалм",
  sleep: "Сплю",
  wink: "Подмигнуть",
  angry: "Злость",
  kiss: "Поцелуй",
  pat: "Погладить",
  smug: "Самодовольно",
  bored: "Скучно",
};

type Tab = "text" | "emoji" | "stickers" | "gif";

/**
 * The room's chat: who's here (with a crown for the host and each line's
 * speed), the talk — bubbles grouped by author, emoji big, stickers and GIFs
 * as pictures — and the box with four tabs: words (PRO), emoji (everyone),
 * animated stickers and GIFs (PRO).
 */
export function PartyChat({
  code,
  members,
  chat,
  myId,
  pro,
  capHeight,
  settings,
}: {
  code: string;
  members: PartyMember[];
  chat: PartyChatMessage[];
  myId: string | null;
  pro: boolean;
  capHeight: number | null;
  settings: PartySettings;
}) {
  const muted = members.find((m) => m.id === myId)?.muted ?? false;
  const [tab, setTab] = useState<Tab>(pro ? "text" : "emoji");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { data: gifs } = useGifLibrary();

  const send = async (body: { text?: string; sticker?: string; gif?: string }) => {
    if (sending) return;
    setSending(true);
    try {
      await apiRequest(`/party/${code}/chat`, { method: "POST", body });
      if (body.text != null) setText("");
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : "Сообщение не отправилось");
    } finally {
      setSending(false);
    }
  };

  const slowest = members.filter((m) => m.mbps != null).sort((a, b) => (a.mbps ?? 0) - (b.mbps ?? 0))[0];

  return (
    <aside className="flex h-[min(70dvh,34rem)] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-[linear-gradient(180deg,var(--accent-surface),transparent_60%)] lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-6.5rem)]">
      {/* Who's here. */}
      <div className="flex flex-col gap-2 border-b border-[var(--accent-line-soft)] p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">В комнате</span>
          <span className="rounded-full bg-primary/15 px-2 text-[11px] font-bold tabular-nums text-primary">
            {members.length}/{PARTY_MAX}
          </span>
          {capHeight && (
            <span
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] text-muted-foreground"
              title={slowest ? `По самому слабому интернету: ${slowest.name}, ${slowest.mbps?.toFixed(1)} Мбит/с` : undefined}
            >
              <WifiIcon className="size-3" />
              всем {capHeight}p
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.05] py-0.5 pl-0.5 pr-2 text-[11px]">
              <span className="relative grid size-5 place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold">
                {m.avatarUrl ? <img src={imageSrc(m.avatarUrl)} alt="" className="size-full object-cover" /> : m.name.charAt(0)}
              </span>
              <span className="max-w-24 truncate">{m.name}</span>
              {m.host && <CrownIcon className="size-3 fill-amber-400 text-amber-400" />}
              {m.loading ? (
                <span className="inline-flex items-center gap-1 text-amber-400" title="У этого участника грузится серия">
                  <Loader2Icon className="size-3 animate-spin" />
                  грузится
                </span>
              ) : (
                <SignalBars mbps={m.mbps} />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* The talk. */}
      <ChatLog chat={chat} myId={myId} />

      {/* The box: words, emoji, stickers, GIFs. */}
      <div className="border-t border-[var(--accent-line-soft)]">
        <div className="grid grid-cols-4 gap-1 p-1.5">
          {(
            [
              ["text", MessageSquareIcon, "Текст", true],
              ["emoji", SmileIcon, "Смайлики", false],
              ["stickers", StickerIcon, "Стикеры", true],
              ["gif", ImageIcon, "GIF", true],
            ] as const
          ).map(([id, Icon, label, needsPro]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-medium transition-colors",
                tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
              {needsPro && !pro && <LockIcon className="absolute right-1.5 top-1 size-2.5 text-amber-400" />}
            </button>
          ))}
        </div>

        <div className="px-2 pb-2">
          {muted ? (
            <p className="rounded-xl bg-rose-500/10 p-3 text-center text-xs text-rose-400">Создатель комнаты отключил вам чат.</p>
          ) : (
          <>
          {tab === "text" &&
            (pro ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void send({ text: text.trim() });
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                  placeholder="Написать в чат…"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--accent-line-soft)] bg-background/60 px-3 text-sm outline-none focus:border-primary/50"
                />
                <button type="submit" disabled={!text.trim() || sending} aria-label="Отправить" className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform active:scale-90 disabled:opacity-50">
                  <SendIcon className="size-4" />
                </button>
              </form>
            ) : (
              <ProLock text="Писать сообщения в комнатах можно с PRO. Смайлики — всем." onEmoji={() => setTab("emoji")} />
            ))}

          {tab === "emoji" && (
            <div className="grid max-h-36 auto-rows-[2.25rem] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain sm:grid-cols-9">
              {PARTY_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={sending}
                  onClick={() => void send({ text: e })}
                  className="grid size-full place-items-center rounded-lg text-xl transition-transform hover:scale-125 hover:bg-foreground/[0.06] active:scale-90"
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {tab === "stickers" && !settings.stickers && <Off text="Стикеры выключены создателем комнаты" />}
          {tab === "stickers" && settings.stickers &&
            (pro ? (
              <div className="grid max-h-44 auto-rows-[3.25rem] grid-cols-5 gap-1 overflow-y-auto overscroll-contain sm:auto-rows-[3.5rem] sm:grid-cols-6">
                {PARTY_STICKERS.map((s) => (
                  <StickerTile key={s.code} code={s.code} label={s.label} disabled={sending} onPick={() => void send({ sticker: s.code })} />
                ))}
              </div>
            ) : (
              <ProLock text="Анимированные стикеры — для участников с PRO." onEmoji={() => setTab("emoji")} />
            ))}

          {tab === "gif" && !settings.gifs && <Off text="Гифки выключены создателем комнаты" />}
          {tab === "gif" && settings.gifs &&
            (pro ? (
              <div className="grid max-h-48 auto-rows-[4.25rem] grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain">
                {Object.entries(gifs ?? {})
                  .filter(([, files]) => files.length > 0)
                  .flatMap(([cat, files]) => files.slice(0, 2).map((f) => ({ cat, f })))
                  .map(({ cat, f }) => (
                    <button
                      key={f}
                      type="button"
                      disabled={sending}
                      onClick={() => void send({ gif: f })}
                      className="group relative size-full overflow-hidden rounded-lg bg-muted"
                      title={GIF_LABELS[cat] ?? cat}
                    >
                      <LiveImg still={gifStill(f)} live={gifUrl(f)} className="size-full transition-transform group-hover:scale-105" fit="object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5 text-[9px] text-white">{GIF_LABELS[cat] ?? cat}</span>
                    </button>
                  ))}
              </div>
            ) : (
              <ProLock text="Гифки в чате — для участников с PRO." onEmoji={() => setTab("emoji")} />
            ))}
          </>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * The talk, drawn again only when it changes — not every time the room
 * ticks. Follows new lines only while you're at the bottom, so reading
 * back isn't yanked away.
 */
const ChatLog = memo(function ChatLog({ chat, myId }: { chat: PartyChatMessage[]; myId: string | null }) {
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.length]);
  return (
    <div
      ref={listRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-2"
    >
      {chat.map((m, i) => {
        if (!m.author || m.kind === "system") {
          return (
            <p key={m.id} className="mx-auto my-1 max-w-[90%] rounded-full bg-foreground/[0.05] px-3 py-1 text-center text-[11px] text-muted-foreground">
              {m.text}
            </p>
          );
        }
        const mine = m.author.id === myId;
        const prev = chat[i - 1];
        const first = !prev || prev.author?.id !== m.author.id || m.at - prev.at > 120_000;
        return (
          <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse", first && "mt-2")}>
            <span className={cn("grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold", !first && "invisible")}>
              {m.author.avatarUrl ? <img src={imageSrc(m.author.avatarUrl)} alt="" className="size-full object-cover" /> : m.author.name.charAt(0)}
            </span>
            <div className={cn("flex min-w-0 max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
              {first && !mine && (
                <span className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-muted-foreground">
                  {m.author.name}
                  {m.author.pro && <ProMark className="text-[10px]" />}
                </span>
              )}
              {m.kind === "sticker" && m.media ? (
                <LiveImg still={stickerStill(m.media)} live={stickerUrl(m.media)} className="party-pop size-24" fit="object-contain" />
              ) : m.kind === "gif" && m.media ? (
                <LiveImg still={gifStill(m.media)} live={gifUrl(m.media)} className="party-pop overflow-hidden rounded-2xl" imgClassName="max-h-40 max-w-[12rem]" fit="object-cover" />
              ) : m.kind === "emoji" ? (
                <span className="party-pop text-4xl leading-tight">{m.text}</span>
              ) : (
                <span
                  className={cn(
                    "whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm [overflow-wrap:anywhere]",
                    mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-foreground/[0.08]",
                  )}
                >
                  {m.text}
                </span>
              )}
              <span className="px-1 text-[10px] text-muted-foreground/70">{time(m.at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

/**
 * A still picture at once, the moving one fading in over it when it has
 * come — a slow phone sees the chat straight away, not empty boxes.
 */
function LiveImg({
  still,
  live,
  className,
  imgClassName,
  fit,
}: {
  still: string;
  live: string | null;
  className?: string;
  imgClassName?: string;
  fit: "object-contain" | "object-cover";
}) {
  const [ready, setReady] = useState(false);
  return (
    <span className={cn("relative block", className)}>
      <img src={still} alt="" decoding="async" className={cn("block", imgClassName ?? "size-full", fit)} />
      {live && (
        <img
          src={live}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setReady(true)}
          className={cn("absolute inset-0 size-full transition-opacity duration-300", fit, ready ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  );
}

/** A sticker in the picker: still (a few KB), moving while the mouse is on it. */
function StickerTile({ code, label, disabled, onPick }: { code: string; label: string; disabled: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onPick}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
      className="grid size-full place-items-center rounded-xl p-1 transition-transform hover:scale-110 hover:bg-foreground/[0.06] active:scale-90"
    >
      <LiveImg still={stickerStill(code)} live={hover ? stickerUrl(code) : null} className="size-full" fit="object-contain" />
    </button>
  );
}

function ProLock({ text, onEmoji }: { text: string; onEmoji: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-3 text-center">
      <p className="flex items-center gap-1.5 text-xs text-foreground/85">
        <LockIcon className="size-3.5 text-amber-400" />
        {text}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onEmoji} className="rounded-lg bg-foreground/[0.07] px-3 py-1.5 text-xs font-medium">
          Смайлики
        </button>
        <Link to="/support" className="rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1.5 text-xs font-bold text-black">
          Получить PRO
        </Link>
      </div>
    </div>
  );
}

function Off({ text }: { text: string }) {
  return <p className="rounded-xl bg-foreground/[0.05] p-3 text-center text-xs text-muted-foreground">{text}</p>;
}
