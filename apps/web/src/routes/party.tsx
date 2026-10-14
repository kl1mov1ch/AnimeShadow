import {
  PARTY_REACTIONS,
  type PartyChatMessage,
  type PartyEvent,
  type PartyMember,
  type PartyPlayback,
  type PartySnapshot,
} from "@animeshadow/shared";
import { CheckIcon, Loader2Icon, LogInIcon, MinusIcon, PlayIcon, PlusIcon, QrCodeIcon, RepeatIcon, SendIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CustomHlsPlayer, sourceUrlFor } from "@/components/anime/watch-section";
import { QrShareCard } from "@/components/common/qr-share";
import { PartyChat } from "@/components/party/party-chat";
import { PartyPicker } from "@/components/party-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, apiStream } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { isKodikUrl, useKodikBridge } from "@/lib/kodik-bridge";
import { usePeople, useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

/**
 * Watching together: one room, up to ten people, the same moment of the same
 * episode on every screen — a pause, a seek or another episode by anyone is
 * everyone's — at the pace of the slowest line in the room, with a chat,
 * stickers and reactions beside the picture.
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
  const [capHeight, setCapHeight] = useState<number | null>(null);
  const [playback, setPlayback] = useState<PartyPlayback | null>(null);
  const [chat, setChat] = useState<PartyChatMessage[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [floating, setFloating] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const [ownFailed, setOwnFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [inviting, setInviting] = useState(false);
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
        setCapHeight(e.capHeight);
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
    (patch: Partial<Pick<PartyPlayback, "episode" | "playing" | "position">> & { waiting?: boolean }) => {
      const p = playbackRef.current;
      if (!p) return;
      const next = {
        episode: patch.episode ?? p.episode,
        playing: patch.playing ?? p.playing,
        position: Math.max(0, patch.position ?? expected()),
        ...(patch.waiting ? { waiting: true } : {}),
      };
      // Shown at once here; the room tells everyone else.
      setPlayback({ episode: next.episode, playing: next.playing, position: next.position, updatedAt: Date.now() + offsetRef.current, by: user?.id ?? null, waitingFor: patch.waiting ? (user?.displayName ?? null) : null });
      void apiRequest(`/party/${code}/playback`, { method: "POST", body: next }).catch(() => toast.error("Не получилось синхронизировать"));
    },
    [code, expected, user?.id, user?.displayName],
  );

  // ---- the picture: our own player when the episode has a stream of ours, Kodik's otherwise
  const animeId = party?.anime.id ?? 0;
  const { data: watch } = useWatchSources(animeId, animeId > 0);
  const episode = playback?.episode ?? 1;
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

  useEffect(() => {
    align();
  }, [playback, align]);
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(align, 3000);
    return () => clearInterval(id);
  }, [joined, align]);

  // ---- the slowest line sets the pace: quality capped for everyone, and a wait for whoever is loading
  useEffect(() => {
    if (ownUrl && joined) window.dispatchEvent(new CustomEvent("as:player-cmd", { detail: { maxHeight: capHeight } }));
  }, [capHeight, ownUrl, joined]);
  const lastNet = useRef<{ at: number; mbps: number | null }>({ at: 0, mbps: null });
  const reportNet = (mbps: number | null) => {
    const now = Date.now();
    const prev = lastNet.current;
    if (now - prev.at < 8000 && prev.mbps != null && mbps != null && Math.abs(prev.mbps - mbps) / prev.mbps < 0.2) return;
    lastNet.current = { at: now, mbps };
    void apiRequest(`/party/${code}/net`, { method: "POST", body: { mbps: mbps == null ? null : Math.round(mbps * 10) / 10 } }).catch(() => undefined);
  };
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const onBuffering = (buffering: boolean) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (buffering) {
      // Short of data for two seconds while the room plays: everyone waits for this screen.
      holdTimer.current = setTimeout(() => {
        const p = playbackRef.current;
        if (!p?.playing || holding.current) return;
        holding.current = true;
        sendPlayback({ playing: false, position: localTime.current, waiting: true });
      }, 2000);
    } else if (holding.current) {
      holdTimer.current = setTimeout(() => {
        holding.current = false;
        sendPlayback({ playing: true, position: localTime.current });
      }, 1200);
    }
  };

  const total = useMemo(() => {
    const s = watch?.sources.find((x) => x.format === "hls");
    const fromOwn = s?.hlsEpisodes ? Math.max(0, ...Object.keys(s.hlsEpisodes).map(Number)) : 0;
    return Math.max(1, fromOwn, party?.anime.episodes ?? 0, episode);
  }, [watch, party, episode]);

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
  const meIsPro = members.find((m) => m.id === user?.id)?.pro ?? false;
  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex min-w-0 flex-col gap-3">
        {/* The room: what, which episode, the invite. */}
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
          <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
            <EpisodeStepper value={episode} total={total} onChange={(n) => sendPlayback({ episode: n, playing: true, position: 0 })} />
            <button
              type="button"
              onClick={() => setPicking(true)}
              title="Сменить аниме для всей комнаты"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <RepeatIcon className="size-3.5" />
              <span className="hidden sm:inline">Аниме</span>
            </button>
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 sm:ml-0"
            >
              <QrCodeIcon className="size-4" />
              Пригласить
            </button>
          </div>
        </header>

        {/* The picture. */}
        <div className="@container/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {party.anime.imageUrl && !joined && (
            <img src={imageSrc(party.anime.imageUrl)} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl" />
          )}
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
              onBuffering={onBuffering}
              onNet={reportNet}
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

          {/* Waiting for the slowest. */}
          {joined && playback.waitingFor && !playback.playing && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Loader2Icon className="size-3.5 animate-spin" />
              Ждём {playback.waitingFor} — серия подгружается
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
                kodikSuppress.current = Date.now() + 3000;
              }}
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/55 text-white"
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
          <span className="ml-auto text-xs text-muted-foreground">Пауза, перемотка и серия — у всех сразу, со скоростью самого медленного</span>
        </div>
      </section>

      <PartyChat code={code} members={members} chat={chat} myId={user?.id ?? null} pro={meIsPro} capHeight={capHeight} />

      <PartyPicker
        open={picking}
        onOpenChange={setPicking}
        title="Сменить аниме"
        hint="Новое аниме включится у всех в комнате."
        onPick={async ({ anime, episode: ep }) => {
          await apiRequest(`/party/${code}/playback`, { method: "POST", body: { animeId: anime.id, episode: ep, playing: false, position: 0 } }).catch(() =>
            toast.error("Не получилось сменить аниме"),
          );
          setPicking(false);
        }}
      />
      {inviting && <InviteDialog code={code} party={party} members={members} onClose={() => setInviting(false)} />}
    </div>
  );
}

/** The episode: −1 / +1 and the number typed in, from 1 to the last. */
function EpisodeStepper({ value, total, onChange }: { value: number; total: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= total && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div className="flex h-10 items-center overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-background/60">
      <button
        type="button"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Предыдущая серия"
        className="grid h-full w-9 place-items-center text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30"
      >
        <MinusIcon className="size-4" />
      </button>
      <label className="flex h-full items-center gap-1 border-x border-[var(--accent-line-soft)] px-2 text-xs text-muted-foreground">
        Серия
        <input
          value={draft}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          aria-label="Номер серии"
          className="w-10 bg-transparent text-center font-display text-base tabular-nums text-foreground outline-none"
        />
        <span className="tabular-nums">из {total}</span>
      </label>
      <button
        type="button"
        disabled={value >= total}
        onClick={() => onChange(value + 1)}
        aria-label="Следующая серия"
        className="grid h-full w-9 place-items-center text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30"
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}

/** Calling people in: the room's QR code and link (to show or send), and friends from the site by Telegram and push. */
function InviteDialog({ code, party, members, onClose }: { code: string; party: PartySnapshot; members: PartyMember[]; onClose: () => void }) {
  const { user } = useAuth();
  const { data: friends = [] } = usePeople(user?.id, "friends");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const here = new Set(members.map((m) => m.id));
  const url = `${window.location.origin}/party/${code}`;
  const title = party.anime.titleLocalized || party.anime.title;

  const call = async () => {
    setSending(true);
    try {
      const r = await apiRequest<{ sent: number; reached: number }>(`/party/${code}/invite`, { method: "POST", body: { userIds: [...picked] } });
      toast.success(r.reached > 0 ? `Позвали: ${r.reached}` : "Приглашение отправлено", {
        description: r.reached < r.sent ? "У кого не подключены Telegram или уведомления — пришлите им ссылку" : undefined,
      });
      setPicked(new Set());
    } catch {
      toast.error("Не получилось пригласить");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-md">
        <DialogTitle className="font-display text-lg">Позвать смотреть вместе</DialogTitle>
        <DialogDescription className="-mt-1 text-xs">Покажите QR-код, отправьте ссылку или позовите друзей с сайта.</DialogDescription>
        <QrShareCard
          url={url}
          title={title}
          description={`Совместный просмотр · ${party.playback.episode} серия · до 10 человек`}
          image={party.anime.imageUrl ? imageSrc(party.anime.imageUrl) : undefined}
          filename={`animeshadow-party-${code}`}
          shareText={`Смотрим «${title}» вместе на AnimeShadow`}
        />
        {friends.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Друзья на сайте</p>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {friends.map((f) => {
                const inRoom = here.has(f.id);
                const on = picked.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={inRoom}
                    onClick={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(f.id)) n.delete(f.id);
                        else if (n.size < 9) n.add(f.id);
                        return n;
                      })
                    }
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors disabled:opacity-50",
                      on ? "bg-primary/12" : "hover:bg-foreground/[0.05]",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                      {f.avatarUrl ? <img src={imageSrc(f.avatarUrl)} alt="" className="size-full object-cover" /> : f.displayName.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{f.displayName}</span>
                    {inRoom ? (
                      <span className="text-[11px] text-emerald-400">уже здесь</span>
                    ) : (
                      <span className={cn("grid size-5 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {on && <CheckIcon className="size-3.5" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={picked.size === 0 || sending}
              onClick={() => void call()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {sending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
              Позвать{picked.size ? ` (${picked.size})` : ""} — придёт в Telegram и уведомлением
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
