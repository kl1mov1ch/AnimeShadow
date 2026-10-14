import {
  PARTY_MAX,
  PARTY_REACTIONS,
  type PartyChatMessage,
  type PartyEvent,
  type PartyMember,
  type PartyPlayback,
  type PartySnapshot,
} from "@animeshadow/shared";
import { CheckIcon, CopyIcon, CrownIcon, Loader2Icon, LogInIcon, PlayIcon, RepeatIcon, SendIcon, UsersIcon } from "lucide-react";
import { PartyPicker } from "@/components/party-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CustomHlsPlayer, sourceUrlFor } from "@/components/anime/watch-section";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, apiStream } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { isKodikUrl, useKodikBridge } from "@/lib/kodik-bridge";
import { useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/**
 * Watching together: one room, up to ten people, the same moment of the same
 * episode on every screen — a pause, a seek or another episode by anyone is
 * everyone's — with a chat and reactions beside the picture.
 */
export function Component() {
  const { code = "" } = useParams();
  const { status } = useAuth();
  if (status === "loading") return <Centered><Loader2Icon className="size-6 animate-spin text-muted-foreground" /></Centered>;
  if (status !== "authenticated") {
    return (
      <Centered>
        <UsersIcon className="size-10 text-primary" />
        <h1 className="font-display text-2xl">Совместный просмотр</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Войдите, чтобы смотреть вместе с друзьями: одна серия, один момент у всех, чат и реакции.</p>
        <Link to="/login" state={{ from: `/party/${code}` }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
          <LogInIcon className="size-4" />
          Войти
        </Link>
      </Centered>
    );
  }
  return <PartyRoom code={code} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 text-center">{children}</div>;
}

function PartyRoom({ code }: { code: string }) {
  const { user } = useAuth();
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [playback, setPlayback] = useState<PartyPlayback | null>(null);
  const [chat, setChat] = useState<PartyChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [floating, setFloating] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const offsetRef = useRef(0);
  const playbackRef = useRef<PartyPlayback | null>(null);
  playbackRef.current = playback;

  // ---- the room's event stream (reconnecting by itself)
  const handleRef = useRef<(e: PartyEvent) => void>(() => undefined);
  handleRef.current = (e: PartyEvent) => {
    if ("now" in e && typeof e.now === "number") offsetRef.current = e.now - Date.now();
    switch (e.type) {
      case "hello":
        offsetRef.current = e.party.now - Date.now();
        setParty(e.party);
        setMembers(e.party.members);
        setPlayback(e.party.playback);
        setChat(e.party.chat);
        setConnected(true);
        break;
      case "members":
        setMembers(e.members);
        break;
      case "playback":
        setPlayback(e.playback);
        break;
      case "anime":
        setParty((p) => (p ? { ...p, anime: e.anime } : p));
        setOwnFailed(false);
        break;
      case "chat":
        setChat((c) => [...c.slice(-150), e.message]);
        break;
      case "reaction": {
        const id = Math.random();
        setFloating((f) => [...f.slice(-20), { id, emoji: e.emoji, x: 10 + Math.random() * 80 }]);
        setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 2600);
        break;
      }
    }
  };
  useEffect(() => {
    const ac = new AbortController();
    let alive = true;
    void (async () => {
      for (let attempt = 0; alive; attempt++) {
        try {
          await apiStream(
            `/party/${code}/events`,
            {
              onData: (d) => handleRef.current(d as PartyEvent),
              onError: (message) => {
                alive = false;
                setFatal(message);
              },
            },
            ac.signal,
          );
        } catch {
          if (!alive) return;
        }
        setConnected(false);
        if (!alive) return;
        await sleep(Math.min(10_000, 800 * 2 ** Math.min(attempt, 4)));
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [code]);

  // ---- where playback should be right now, by the room's clock
  const expected = useCallback(() => {
    const p = playbackRef.current;
    if (!p) return 0;
    return p.playing ? p.position + (Date.now() + offsetRef.current - p.updatedAt) / 1000 : p.position;
  }, []);

  const sendPlayback = useCallback(
    (patch: Partial<Pick<PartyPlayback, "episode" | "playing" | "position">>) => {
      const p = playbackRef.current;
      if (!p) return;
      const next = { episode: patch.episode ?? p.episode, playing: patch.playing ?? p.playing, position: Math.max(0, patch.position ?? expected()) };
      // Shown at once here; the room tells everyone else.
      setPlayback({ ...next, updatedAt: Date.now() + offsetRef.current, by: user?.id ?? null });
      void apiRequest(`/party/${code}/playback`, { method: "POST", body: next }).catch(() => toast.error("Не получилось синхронизировать"));
    },
    [code, expected, user?.id],
  );

  // ---- the picture: our own player when the episode has a stream of ours, Kodik's otherwise
  const animeId = party?.anime.id ?? 0;
  const { data: watch } = useWatchSources(animeId, animeId > 0);
  const episode = playback?.episode ?? 1;
  const [ownFailed, setOwnFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const own = !ownFailed ? watch?.sources.find((s) => s.format === "hls" && s.hlsEpisodes?.[String(episode)]) : undefined;
  const kodikSource = watch?.sources.find((s) => s.format !== "hls" && isKodikUrl(s.embedUrl) && (!s.iframeEpisodes || s.iframeEpisodes[String(episode)]));
  const ownUrl = own ? sourceUrlFor(own, episode) : null;
  const kodikUrl = !ownUrl && kodikSource ? sourceUrlFor(kodikSource, episode) : null;

  const localTime = useRef(0);
  const localPlaying = useRef(false);
  const kodikSuppress = useRef(0);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const report = (type: "play" | "pause" | "seek", time: number) => {
    localTime.current = time;
    if (type === "play") localPlaying.current = true;
    if (type === "pause") localPlaying.current = false;
    sendPlayback({ playing: type === "seek" ? localPlaying.current : type === "play", position: time });
  };
  const kodik = useKodikBridge(frame, {
    onTime: (t) => (localTime.current = t),
    onPlay: () => {
      localPlaying.current = true;
      if (Date.now() > kodikSuppress.current) report("play", localTime.current);
    },
    onPause: () => {
      localPlaying.current = false;
      if (Date.now() > kodikSuppress.current) report("pause", localTime.current);
    },
    onSeek: (s) => {
      if (s != null) localTime.current = s;
      if (Date.now() > kodikSuppress.current && s != null) report("seek", s);
    },
  });

  /** Bring this screen to the room's moment (only what differs). */
  const align = useCallback(() => {
    const p = playbackRef.current;
    if (!p || !joined) return;
    const want = expected();
    const drift = Math.abs(localTime.current - want);
    const seek = drift > 2.5 ? want : undefined;
    const playChange = p.playing !== localPlaying.current;
    if (seek == null && !playChange) return;
    if (ownUrl) {
      window.dispatchEvent(new CustomEvent("as:player-cmd", { detail: { seconds: seek, play: p.playing } }));
    } else if (kodikUrl) {
      kodikSuppress.current = Date.now() + 1500;
      if (seek != null) kodik.seek(seek);
      if (p.playing) kodik.play();
      else kodik.pause();
    }
    localPlaying.current = p.playing;
    if (seek != null) localTime.current = seek;
  }, [joined, expected, ownUrl, kodikUrl, kodik]);

  // Every change from the room, and a check every three seconds for drift.
  useEffect(() => {
    align();
  }, [playback, align]);
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(align, 3000);
    return () => clearInterval(id);
  }, [joined, align]);

  const total = useMemo(() => {
    const own = watch?.sources.find((s) => s.format === "hls");
    const fromOwn = own?.hlsEpisodes ? Math.max(0, ...Object.keys(own.hlsEpisodes).map(Number)) : 0;
    return Math.max(fromOwn, party?.anime.episodes ?? 0, episode);
  }, [watch, party, episode]);

  const invite = typeof window !== "undefined" ? `${window.location.origin}/party/${code}` : "";
  const [copied, setCopied] = useState(false);

  if (fatal) {
    return (
      <Centered>
        <UsersIcon className="size-10 text-muted-foreground" />
        <h1 className="font-display text-xl">Не получилось войти в комнату</h1>
        <p className="text-sm text-muted-foreground">{fatal}</p>
        <Link to="/" className="text-sm text-primary hover:underline">На главную</Link>
      </Centered>
    );
  }
  if (!party || !playback) {
    return <Centered><Loader2Icon className="size-6 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Подключаемся к комнате…</p></Centered>;
  }

  const title = party.anime.titleLocalized || party.anime.title;
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex min-w-0 flex-col gap-3">
        {/* The room: what, which episode, who, the invite. */}
        <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 p-3">
          {party.anime.imageUrl && <img src={imageSrc(party.anime.imageUrl)} alt="" className="aspect-[2/3] w-10 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <UsersIcon className="size-3.5" />
              Совместный просмотр
              <span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-400" : "animate-pulse bg-amber-400")} title={connected ? "На связи" : "Переподключаемся…"} />
            </p>
            <Link to={animeHref(party.anime)} className="block truncate font-display text-lg leading-tight hover:text-primary">{title}</Link>
          </div>
          <div className="flex basis-full items-center gap-2 sm:basis-auto">
          <button
            type="button"
            onClick={() => setPicking(true)}
            title="Сменить аниме для всей комнаты"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--accent-line-soft)] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <RepeatIcon className="size-3.5" />
            <span className="hidden sm:inline">Сменить аниме</span>
          </button>
          <label className="flex flex-1 items-center gap-2 text-sm sm:flex-none">
            <span className="text-muted-foreground">Серия</span>
            <select
              value={episode}
              onChange={(e) => sendPlayback({ episode: Number(e.target.value), playing: true, position: 0 })}
              className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--accent-line-soft)] bg-background px-2 text-sm sm:w-20 sm:flex-none"
            >
              {Array.from({ length: Math.max(1, total) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(invite).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Скопировано" : "Пригласить"}
          </button>
          </div>
        </header>

        {/* The picture. */}
        <div className="@container/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {ownUrl && own ? (
            <CustomHlsPlayer
              key={ownUrl}
              src={ownUrl}
              variants={own.hlsVariants?.[String(episode)] ?? null}
              skin="shadow"
              isWinner={joined}
              onReady={() => undefined}
              onFailed={() => setOwnFailed(true)}
              onTime={(t) => (localTime.current = t)}
              onUserAction={(a) => report(a.type, a.time)}
            />
          ) : kodikUrl ? (
            <iframe
              key={kodikUrl}
              ref={setFrame}
              src={kodikUrl}
              title={title}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
              {watch ? "Для этой серии нет плеера" : <Loader2Icon className="size-6 animate-spin" />}
            </div>
          )}

          {/* Reactions float up over the picture. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {floating.map((f) => (
              <span key={f.id} className="party-float absolute bottom-6 text-3xl" style={{ left: `${f.x}%` }}>
                {f.emoji}
              </span>
            ))}
          </div>

          {/* A tap first: browsers start sound only after one. */}
          {!joined && (
            <button
              type="button"
              onClick={() => {
                setJoined(true);
                localPlaying.current = false;
                // Kodik may start by itself: not the viewer's doing.
                kodikSuppress.current = Date.now() + 3000;
              }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/70 text-white backdrop-blur-sm"
            >
              <span className="grid size-16 place-items-center rounded-full bg-primary shadow-2xl shadow-primary/40">
                <PlayIcon className="size-7 translate-x-0.5 fill-current" />
              </span>
              <span className="font-display text-xl">Смотреть вместе</span>
              <span className="text-xs text-white/70">
                {playback.playing ? `Уже идёт ${episode} серия · ${clock(expected())}` : `Серия ${episode} · на паузе ${clock(playback.position)}`}
              </span>
            </button>
          )}
        </div>

        {/* Reactions. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PARTY_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void apiRequest(`/party/${code}/react`, { method: "POST", body: { emoji } }).catch(() => undefined)}
              className="grid size-10 place-items-center rounded-xl border border-[var(--accent-line-soft)] bg-card/50 text-xl transition-transform hover:-translate-y-0.5 active:scale-90"
              aria-label={`Реакция ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">Пауза, перемотка и смена серии — у всех сразу</span>
        </div>
      </section>

      <PartyChat code={code} members={members} chat={chat} myId={user?.id ?? null} />
      <PartyPicker
        open={picking}
        onOpenChange={setPicking}
        title="Сменить аниме"
        hint="Новое аниме включится у всех в комнате."
        onPick={async ({ anime, episode }) => {
          await apiRequest(`/party/${code}/playback`, { method: "POST", body: { animeId: anime.id, episode, playing: false, position: 0 } }).catch(() =>
            toast.error("Не получилось сменить аниме"),
          );
          setPicking(false);
        }}
      />
    </div>
  );
}

function PartyChat({ code, members, chat, myId }: { code: string; members: PartyMember[]; chat: PartyChatMessage[]; myId: string | null }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await apiRequest(`/party/${code}/chat`, { method: "POST", body: { text: body } });
      setText("");
    } catch {
      toast.error("Сообщение не отправилось");
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="flex h-[65vh] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 lg:sticky lg:top-20 lg:h-[calc(100dvh-6.5rem)]">
      {/* Who's here. */}
      <div className="flex items-center gap-2 border-b border-[var(--accent-line-soft)] p-3">
        <span className="text-sm font-semibold">В комнате</span>
        <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-semibold tabular-nums">
          {members.length}/{PARTY_MAX}
        </span>
        <span className="ml-auto flex -space-x-2">
          {members.slice(0, 7).map((m) => (
            <span key={m.id} title={m.host ? `${m.name} — создатель` : m.name} className="relative">
              <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold ring-2 ring-card">
                {m.avatarUrl ? <img src={imageSrc(m.avatarUrl)} alt="" className="size-full object-cover" /> : m.name.charAt(0)}
              </span>
              {m.host && <CrownIcon className="absolute -right-1 -top-1.5 size-3.5 fill-amber-400 text-amber-400" />}
            </span>
          ))}
        </span>
      </div>

      {/* The talk. */}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {chat.map((m) =>
          m.author ? (
            <div key={m.id} className={cn("flex items-end gap-2", m.author.id === myId && "flex-row-reverse")}>
              <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold">
                {m.author.avatarUrl ? <img src={imageSrc(m.author.avatarUrl)} alt="" className="size-full object-cover" /> : m.author.name.charAt(0)}
              </span>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-1.5 text-sm", m.author.id === myId ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-foreground/[0.07]")}>
                {m.author.id !== myId && <p className="text-[11px] font-semibold opacity-70">{m.author.name}</p>}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.text}</p>
              </div>
            </div>
          ) : (
            <p key={m.id} className="text-center text-[11px] text-muted-foreground">{m.text}</p>
          ),
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-[var(--accent-line-soft)] p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
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
    </aside>
  );
}
