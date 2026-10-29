import {
  PARTY_REACTIONS,
  sourceBelongsToStudio,
  type PartyChatMessage,
  type PartyEvent,
  type PartyMember,
  type PartyPlayback,
  type PartyQueueItem,
  type PartySnapshot,
  type PartyVisibility,
} from "@animeshadow/shared";
import { VISIBILITY } from "@/components/party/visibility";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { CheckIcon, HeartIcon, ListVideoIcon, Loader2Icon, LogInIcon, LogOutIcon, MinusIcon, PlayIcon, PlusIcon, QrCodeIcon, RefreshCwIcon, RepeatIcon, SendIcon, SkipForwardIcon, SlidersHorizontalIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { HostPanel } from "@/components/party/host-panel";
import { toast } from "sonner";
import { CustomHlsPlayer, sourceUrlFor } from "@/components/anime/watch-section";
import { QrShareCard } from "@/components/common/qr-share";
import { PartyChat } from "@/components/party/party-chat";
import { PartyPicker } from "@/components/party-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { ApiRequestError, apiRequest, apiStream } from "@/lib/api";
import { animeHref, imageSrc } from "@/lib/format";
import { usePeople, useWatchSources } from "@/lib/query";
import { cn } from "@/lib/utils";
import { RoomPushButton } from "@/components/party/room-push-button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dubName } from "@/lib/playback-sources";

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
  return <PartyRoom key={code} code={code} />;
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
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposalEpisode, setProposalEpisode] = useState(1);
  const navigate = useNavigate();
  const [closed, setClosed] = useState<string | null>(null);
  const closedRef = useRef(false);
  const offsetRef = useRef(0);
  /** The clock is set from a measured round trip — event timestamps no longer move it. */
  const clockSet = useRef(false);
  const [queue, setQueue] = useState<PartyQueueItem[]>([]);
  const playbackRef = useRef<PartyPlayback | null>(null);
  playbackRef.current = playback;

  // ---- the room's event stream (reconnecting by itself)
  const handleRef = useRef<(e: PartyEvent) => void>(() => undefined);
  handleRef.current = (e: PartyEvent) => {
    if (!clockSet.current && "now" in e && typeof e.now === "number") offsetRef.current = e.now - Date.now();
    switch (e.type) {
      case "hello":
        if (!clockSet.current) offsetRef.current = e.party.now - Date.now();
        setParty(e.party);
        setQueue(e.party.queue ?? []);
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
      case "settings":
        setParty((p) => (p ? { ...p, settings: e.settings } : p));
        break;
      case "host":
        setParty((p) => p ? { ...p, hostId: e.hostId } : p);
        toast.info("Ведущий сменился", { description: `Теперь управляет ${e.name}`, id: `party-host-${code}` });
        break;
      case "ballot":
        setParty((p) => p ? { ...p, nextVotes: e.nextVotes } : p);
        break;
      case "queue":
        setQueue(e.queue);
        break;
      case "closed":
        closedRef.current = true;
        setClosed(e.reason);
        break;
      case "anime":
        setParty((p) => (p ? { ...p, anime: e.anime } : p));
        setFailedSources([]);
        break;
      case "chat":
        setChat((c) => [...c.slice(-150), e.message]);
        break;
      case "unchat":
        setChat((c) => c.filter((m) => m.id !== e.id));
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
        const connection = new AbortController();
        const abort = () => connection.abort();
        ac.signal.addEventListener("abort", abort, { once: true });
        let lastEvent = Date.now();
        const heartbeat = setInterval(() => { if (Date.now() - lastEvent > 45_000) connection.abort(); }, 10_000);
        try {
          await apiStream(
            `/party/${code}/events`,
            {
              onData: (d) => { lastEvent = Date.now(); handleRef.current(d as PartyEvent); },
              onError: (message) => {
                alive = false;
                setFatal(message);
              },
            },
            connection.signal,
          );
        } catch {
          if (!alive) return;
        } finally {
          clearInterval(heartbeat);
          ac.signal.removeEventListener("abort", abort);
        }
        setConnected(false);
        if (!alive || closedRef.current) return;
        await sleep(Math.min(10_000, 800 * 2 ** Math.min(attempt, 4)));
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [code]);

  // A bounded history request backs up the initial SSE snapshot. Merge by id
  // so messages arriving while it is in flight are kept exactly once.
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void apiRequest<{ messages: PartyChatMessage[] }>(`/party/${code}/history`, { signal: controller.signal }).then(({ messages }) => {
      setChat((current) => [...new Map([...messages, ...current].map((message) => [message.id, message])).values()].sort((a, b) => a.at - b.at).slice(-120));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [code, connected]);

  // ---- the room's clock: measured against the server, so every screen means the same second
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      let best: { rtt: number; offset: number } | null = null;
      for (let i = 0; i < 5 && alive; i++) {
        const t0 = Date.now();
        try {
          const { now } = await apiRequest<{ now: number }>("/party-clock");
          const t1 = Date.now();
          const rtt = t1 - t0;
          if (!best || rtt < best.rtt) best = { rtt, offset: now - (t0 + t1) / 2 };
        } catch {
          // Next sample.
        }
      }
      if (alive && best) {
        offsetRef.current = best.offset;
        clockSet.current = true;
      }
    };
    void sync();
    const id = setInterval(() => void sync(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ---- where playback should be right now, by the room's clock
  const expected = useCallback(() => {
    const p = playbackRef.current;
    if (!p) return 0;
    return p.playing ? p.position + (Date.now() + offsetRef.current - p.updatedAt) / 1000 : p.position;
  }, []);

  const sendPlayback = useCallback(
    (patch: Partial<Pick<PartyPlayback, "episode" | "playing" | "position" | "sourceId">> & { waiting?: boolean }) => {
      const p = playbackRef.current;
      if (!p) return;
      const next = {
        sourceId: patch.sourceId ?? p.sourceId ?? null,
        episode: patch.episode ?? p.episode,
        playing: patch.playing ?? p.playing,
        position: Math.max(0, patch.position ?? expected()),
        ...(patch.waiting ? { waiting: true } : {}),
      };
      // Shown at once here; the room tells everyone else.
      setPlayback({ ...next, updatedAt: Date.now() + offsetRef.current, by: user?.id ?? null, waitingFor: patch.waiting ? (user?.displayName ?? null) : null });
      void apiRequest(`/party/${code}/playback`, { method: "POST", body: next }).catch(() => toast.error("Не получилось синхронизировать"));
    },
    [code, expected, user?.id, user?.displayName],
  );

  // ---- every provider uses our own player, with another dub on failure
  const animeId = party?.anime.id ?? 0;
  const { data: watch, refreshSources } = useWatchSources(animeId, animeId > 0);
  const episode = playback?.episode ?? 1;
  const studioSources = watch?.sources.filter((s) => sourceBelongsToStudio(s, party?.studio)) ?? [];
  const studioEpisodes = [...new Set(studioSources.flatMap((s) => Object.keys(s.hlsEpisodes ?? s.mediaEpisodes ?? {}).map(Number)))].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  const roomSources = studioSources.filter((s) => (s.format === "hls" || s.format === "mp4") && (s.hlsEpisodes ?? s.mediaEpisodes)?.[String(episode)]);
  const own = roomSources.find((s) => s.id === playback?.sourceId && !failedSources.includes(s.id)) ?? roomSources.find((s) => !failedSources.includes(s.id));
  const ownUrl = own ? sourceUrlFor(own, episode) : null;
  useEffect(() => { setFailedSources([]); }, [animeId, episode]);

  const isHost = party != null && user != null && party.hostId === user.id;
  const onEndedRef = useRef<() => void>(() => undefined);
  const canControl = isHost || (party?.settings.allControl ?? false);
  const canControlRef = useRef(canControl);
  canControlRef.current = canControl;
  const toldNoControl = useRef(0);

  const localTime = useRef(0);
  const localPlaying = useRef(false);
  const report = (type: "play" | "pause" | "seek", time: number) => {
    localTime.current = time;
    if (type === "play") localPlaying.current = true;
    if (type === "pause") localPlaying.current = false;
    // Not ours to steer: the room puts this screen back at its next check.
    if (!canControlRef.current) {
      if (type === "play") return;
      if (Date.now() - toldNoControl.current > 15_000) {
        toldNoControl.current = Date.now();
        toast(party?.official ? "Идёт общий эфир" : "Управляет ведущий комнаты", { description: "Пауза и перемотка вернутся к общему моменту" });
      }
      return;
    }
    sendPlayback({ playing: type === "seek" ? localPlaying.current : type === "play", position: time });
  };

  /**
   * Bring this screen to the room's moment. Our player: within a third of a
   * second it's left alone, up to two seconds it plays 8 % faster or slower
   * until it's there (no jump), beyond that it seeks.
   */
  const rateRef = useRef(1);
  // A seek on a slow line takes a while to land. Seeking again every second
  // while the last one is still loading (the room's clock keeps running)
  // never let it land at all: the picture froze and jumped in a loop. One
  // seek, then wait until this screen plays again (or ten seconds pass).
  const lastSeekAt = useRef(0);
  const bufferingRef = useRef(false);
  const align = useCallback((force = false) => {
    const p = playbackRef.current;
    if (!p || !joined || !ownUrl) return;
    const want = expected();
    const diff = localTime.current - want;
    const drift = Math.abs(diff);
    const playChange = p.playing !== localPlaying.current;
    const settling = bufferingRef.current || Date.now() - lastSeekAt.current < 4000;
    const settled = Date.now() - lastSeekAt.current > 10_000;
    const due = drift > 2.5 && (!settling || (settled && drift > 8));
    // Landing a little ahead while playing covers the time the seek itself takes.
    const seek = force || due ? want + (p.playing && drift > 2.5 ? 0.6 : 0) : undefined;
    const rate = !p.playing || seek != null || drift < 0.3 || drift > 2.5 || bufferingRef.current ? 1 : diff < 0 ? 1.08 : 0.92;
    if (seek == null && !playChange && rate === rateRef.current) return;
    rateRef.current = rate;
    window.dispatchEvent(new CustomEvent("as:player-cmd", { detail: { seconds: seek, play: p.playing, rate } }));
    localPlaying.current = p.playing;
    if (seek != null) {
      localTime.current = seek;
      lastSeekAt.current = Date.now();
    }
  }, [joined, expected, ownUrl]);

  // Someone in the room jumped (a seek, not the clock running on): that
  // lands here at once, even mid-load — waiting would play the wrong scene.
  const prevPlayback = useRef(playback);
  useEffect(() => {
    const prev = prevPlayback.current;
    prevPlayback.current = playback;
    const at = (p: NonNullable<typeof playback>, time: number) => (p.playing ? p.position + (time - p.updatedAt) / 1000 : p.position);
    const jumped = prev != null && playback != null && prev.episode === playback.episode && Math.abs(at(prev, playback.updatedAt) - playback.position) > 2.5;
    align(jumped);
  }, [playback, align]);
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => align(), 1000);
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
  const loadingSent = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendLoading = (loading: boolean) => {
    if (loadingSent.current === loading) return;
    loadingSent.current = loading;
    void apiRequest(`/party/${code}/loading`, { method: "POST", body: { loading } }).catch(() => undefined);
  };
  const onBuffering = (buffering: boolean) => {
    bufferingRef.current = buffering;
    if (stallTimer.current) clearTimeout(stallTimer.current);
    // Short of data for a couple of seconds while the room plays: the room
    // waits for this screen. It goes on once a few seconds are loaded ahead —
    // not at the first frame, which only stalled again and paused everyone
    // in a loop.
    if (buffering && playbackRef.current?.playing) stallTimer.current = setTimeout(() => sendLoading(true), 2500);
    else if (!buffering && loadingSent.current) stallTimer.current = setTimeout(() => sendLoading(false), 8000);
  };
  const onAhead = (seconds: number) => {
    if (!loadingSent.current || seconds < 6) return;
    if (stallTimer.current) clearTimeout(stallTimer.current);
    sendLoading(false);
  };
  // A new episode or title: whatever this screen was loading no longer holds anyone.
  useEffect(() => {
    loadingSent.current = false;
  }, [episode, animeId]);

  // ---- an episode's end: the host's screen moves the room on (the next episode, or the most wanted title)
  const total0 = useRef(0);
  const onEpisodeEnd = () => {
    if (party?.official) {
      if (localTime.current >= 60) void apiRequest(`/party/${code}/ended`, { method: "POST", body: { animeId, episode, duration: localTime.current } }).catch(() => undefined);
      return;
    }
    if (!isHost || !party?.settings.autoNext) return;
    const following = party.studio ? studioEpisodes.find((n) => n > episode) : episode < total0.current ? episode + 1 : undefined;
    if (following != null) {
      sendPlayback({ episode: following, playing: true, position: 0 });
      return;
    }
    const next = queue[0];
    if (next) void apiRequest(`/party/${code}/playback`, { method: "POST", body: { animeId: next.anime.id, episode: next.episode ?? 1, playing: true, position: 0 } }).catch(() => undefined);
  };


  // ---- leaving: only this member leaves; the room keeps its other viewers
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !closedRef.current && joined && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!joined || closed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [joined, closed]);
  const confirmingRef = useRef(false);
  /** Out of the room: told to the server, then on to where the viewer was going. */
  const leave = () => {
    confirmingRef.current = true;
    closedRef.current = true;
    void apiRequest(`/party/${code}/leave`, { method: "POST" }).catch(() => undefined);
    if (blocker.state === "blocked") blocker.proceed();
    else navigate("/party");
  };

  onEndedRef.current = onEpisodeEnd;
  const total = useMemo(() => {
    const available = watch?.sources.filter((s) => sourceBelongsToStudio(s, party?.studio)).flatMap((source) => Object.keys(source.hlsEpisodes ?? source.mediaEpisodes ?? {}).map(Number)) ?? [];
    return available.length ? Math.max(1, ...available) : Math.max(1, episode);
  }, [watch, episode, party?.studio]);
  total0.current = total;

  if (closed) {
    return (
      <Centered>
        <UsersIcon className="size-10 text-muted-foreground" />
        <h1 className="font-display text-xl">Комната закрыта</h1>
        <p className="text-sm text-muted-foreground">{closed}</p>
        <Link to="/party" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
          К списку комнат
        </Link>
      </Centered>
    );
  }
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
    <div className="mx-auto grid w-full max-w-[1400px] items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* A phone: the picture, the chat right under it, then what's next. A computer: the chat as a column beside both. */}
      <section className="flex min-w-0 flex-col gap-2.5 sm:gap-3 lg:col-start-1 lg:row-start-1">
        {/* The room: what, which episode, the invite. */}
        <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 p-3">
          {party.anime.imageUrl && <img src={imageSrc(party.anime.imageUrl, 240)} alt="" decoding="async" className="aspect-[2/3] w-10 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <UsersIcon className="size-3.5" />
              {party.name || (party.official ? "Общий зал AnimeShadow" : "Совместный просмотр")}
              <span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-400" : "animate-pulse bg-amber-400")} title={connected ? "На связи" : "Переподключаемся…"} />
            </p>
            <Link to={`${animeHref(party.anime)}${party.studio ? "?studio=hon-kon" : ""}`} className="block truncate font-display text-lg leading-tight hover:text-primary">{title}</Link>
          </div>
          <div className="flex basis-full flex-wrap items-center gap-2">
            {!party.official && <RoomPushButton />}
            <EpisodeStepper value={episode} total={total} disabled={!canControl} onChange={(n) => {
              const target = party.studio ? n > episode ? studioEpisodes.find((e) => e > episode) : studioEpisodes.slice().reverse().find((e) => e < episode) : n;
              if (target != null) sendPlayback({ episode: target, playing: true, position: 0 });
            }} />
            {party.studio === "hon-kon" && <Link to="/studio/hon-kon" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary"><HonkonGlyph className="size-5" />Hon-Kon Studio</Link>}
            {roomSources.length > 0 && !party.studio && <Select value={own?.id ?? ""} disabled={!canControl} onValueChange={(sourceId) => sendPlayback({ sourceId })}>
              <SelectTrigger aria-label="Озвучка комнаты" className="h-10 max-w-[min(13rem,100%)] text-xs"><SelectValue placeholder="Озвучка" /></SelectTrigger>
              <SelectContent position="popper" className="max-w-[calc(100vw-2rem)]"><SelectGroup>{roomSources.map((source) => <SelectItem key={source.id} value={source.id}>{dubName(source.title)}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>}
            {canControl && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                title="Сменить аниме для всей комнаты"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                <RepeatIcon className="size-3.5" />
                <span className="hidden sm:inline">Аниме</span>
              </button>
            )}
            {isHost ? (
              <button
                type="button"
                onClick={() => setManaging(true)}
                title="Управление комнатой"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                <SlidersHorizontalIcon className="size-3.5" />
                <span className="hidden sm:inline">Управление</span>
              </button>
            ) : (
              <VisibilityBadge value={party.settings.visibility} />
            )}
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
            >
              <QrCodeIcon className="size-4" />
              Пригласить
            </button>
            <button
              type="button"
              onClick={() => (joined ? setAskLeave(true) : navigate("/party"))}
              title="Выйти из комнаты"
              aria-label="Выйти из комнаты"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-400/50 hover:text-rose-400"
            >
              <LogOutIcon className="size-3.5" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </header>

        {/* The picture. */}
        <div className="@container/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
          {party.anime.imageUrl && !joined && (
            <img src={imageSrc(party.anime.imageUrl, 240)} alt="" aria-hidden decoding="async" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl" />
          )}
          {ownUrl && own ? (
            <CustomHlsPlayer
              format={own.format === "mp4" ? "mp4" : "hls"}
              key={ownUrl}
              src={ownUrl}
              mediaTitle={`${title} · Серия ${episode}`}
              resumeFrom={expected()}
              resumeExact
              onRefreshSource={refreshSources}
              variants={own.hlsVariants?.[String(episode)] ?? null}
              skin="shadow"
              isWinner={joined}
              onReady={() => align(true)}
              onFailed={() => setFailedSources((failed) => [...new Set([...failed, own.id])])}
              onTime={(t) => (localTime.current = t)}
              onUserAction={(a) => report(a.type, a.time)}
              onBuffering={onBuffering}
              onNet={reportNet}
              onAhead={onAhead}
              onEnded={() => onEndedRef.current()}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/70">
              {!watch || watch.sourcesPending ? <><Loader2Icon className="size-6 animate-spin" /><span>Загружаем озвучки…</span></> : "Для этой серии сейчас нет доступного потока"}
              {watch && <button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                onClick={() => void refreshSources().then(() => setFailedSources([])).catch(() => toast.error("Не получилось обновить потоки"))}>Повторить загрузку</button>}
            </div>
          )}

          {/* Waiting for the slowest. */}
          {joined && playback.waitingFor && !playback.playing && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">Пауза: ждём {playback.waitingFor} — грузится</span>
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
          {!party.settings.reactions && <span className="text-xs text-muted-foreground">Реакции выключены ведущим</span>}
          {party.settings.reactions && PARTY_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void apiRequest(`/party/${code}/react`, { method: "POST", body: { emoji } }).catch(() => undefined)}
              className="grid size-9 place-items-center rounded-xl border border-[var(--accent-line-soft)] bg-card/50 text-lg transition-transform hover:-translate-y-0.5 active:scale-90 sm:size-10 sm:text-xl"
              aria-label={`Реакция ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => align(true)}
            title="Встать на общий момент, если картинка разошлась"
            aria-label="Синхронизироваться"
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3"
          >
            <RefreshCwIcon className="size-3.5" />
            <span className="hidden sm:inline">Синхронизироваться</span>
          </button>
        </div>

      </section>

      <PartyChat code={code} members={members} chat={chat} myId={user?.id ?? null} pro={meIsPro || !!party.official} capHeight={capHeight} settings={party.settings} capacity={party.capacity ?? 10} />
        <NextUp
          official={party.official ?? false}
          canPropose={!party.official || meIsPro}
          nextVotes={party.nextVotes ?? []}
          availableEpisodes={party.availableEpisodes ?? []}
          className="lg:col-start-1 lg:row-start-2"
          code={code}
          queue={queue}
          myId={user?.id ?? null}
          isHost={isHost}
          canControl={canControl}
          episode={episode}
          total={total}
          anime={party.anime}
          autoNext={party.settings.autoNext}
          onNextEpisode={() => sendPlayback({ episode: episode + 1, playing: true, position: 0 })}
          onPropose={() => { setProposalEpisode(1); setProposing(true); }}
        />
      <PartyPicker
        open={proposing}
        onOpenChange={setProposing}
        title="Предложить аниме"
        hint="Выберите серию и тайтл. Предложение попадёт в голосование за продолжение."
        header={<label className="flex items-center gap-3 text-sm">Начать с серии<input aria-label="Серия предложения" type="number" min={1} max={5000} value={proposalEpisode} onChange={(event) => setProposalEpisode(Math.min(5000, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-24 rounded-lg border border-border bg-background px-3" /></label>}
        onPick={async ({ anime }) => {
          try {
            await apiRequest(`/party/${code}/queue`, { method: "POST", body: { animeId: anime.id, episode: proposalEpisode } });
            toast.success("Предложено"); setProposing(false);
          } catch (error) { toast.error(error instanceof ApiRequestError ? error.message : "Не получилось"); }
        }}
      />
      {managing && <HostPanel code={code} settings={party.settings} members={members} onClose={() => setManaging(false)} />}
      {(askLeave || blocker.state === "blocked") && (
        <ConfirmDialog
          open
          onOpenChange={(v) => {
            if (v || confirmingRef.current) return;
            setAskLeave(false);
            if (blocker.state === "blocked") blocker.reset();
          }}
          title="Выйти из комнаты?"
          description={
            party.official ? "Остальные продолжат просмотр. Пустой зал встанет на паузу до возвращения зрителей." : "Остальные продолжат просмотр. Если выйдут все, комната подождёт 5 минут."
          }
          confirmLabel="Выйти"
          onConfirm={leave}
        />
      )}

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

/** Which kind of room this is, for the people in it. */
function VisibilityBadge({ value }: { value: PartyVisibility }) {
  const V = VISIBILITY[value];
  return (
    <span title={V.hint} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs text-muted-foreground">
      <V.icon className="size-3.5" />
      <span className="hidden sm:inline">{V.label}</span>
    </span>
  );
}

/** The episode: −1 / +1 and the number typed in, from 1 to the last. */
function EpisodeStepper({ value, total, onChange, disabled = false }: { value: number; total: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (disabled) { setDraft(String(value)); return; }
    const n = Math.round(Number(draft));
    if (Number.isFinite(n) && n >= 1 && n <= total && n !== value) onChange(n);
    else setDraft(String(value));
  };
  return (
    <div
      title={disabled ? "Серию меняет ведущий комнаты" : undefined}
      className={cn("flex h-10 items-center overflow-hidden rounded-xl border border-[var(--accent-line-soft)] bg-background/60", disabled && "pointer-events-none opacity-60")}
    >
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Предыдущая серия"
        className="grid h-full w-9 place-items-center text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-30"
      >
        <MinusIcon className="size-4" />
      </button>
      <label className="flex h-full items-center gap-1 border-x border-[var(--accent-line-soft)] px-2 text-xs text-muted-foreground">
        Серия
        <input
          disabled={disabled}
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
        disabled={disabled || value >= total}
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

/**
 * "Дальше": the next episode (with whether it starts by itself), and the
 * titles people proposed, most wanted first — a heart to vote, the host's
 * "Включить" to put one on for everyone.
 */
function NextUp({
  official,
  canPropose,
  nextVotes,
  availableEpisodes,
  className,
  code,
  queue,
  myId,
  isHost,
  canControl,
  episode,
  total,
  anime,
  autoNext,
  onNextEpisode,
  onPropose,
}: {
  official: boolean;
  canPropose: boolean;
  nextVotes: string[];
  availableEpisodes: number[];
  className?: string;
  code: string;
  queue: PartyQueueItem[];
  myId: string | null;
  isHost: boolean;
  canControl: boolean;
  episode: number;
  total: number;
  anime: PartySnapshot["anime"];
  autoNext: boolean;
  onNextEpisode: () => void;
  onPropose: () => void;
}) {
  const vote = (id: number) => void apiRequest(`/party/${code}/queue/${id}/vote`, { method: "POST" }).catch((error: unknown) => toast.error(error instanceof ApiRequestError ? error.message : "Не получилось проголосовать"));
  const remove = (id: number) => void apiRequest(`/party/${code}/queue/${id}`, { method: "DELETE" }).catch(() => undefined);
  const play = (id: number, targetEpisode = 1) =>
    void apiRequest(`/party/${code}/playback`, { method: "POST", body: { animeId: id, episode: targetEpisode, playing: false, position: 0 } }).catch(() =>
      toast.error("Не получилось включить"),
    );
  const hasNext = official ? availableEpisodes.includes(episode + 1) : episode < total;
  return (
    <section className={cn("flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[var(--accent-line-soft)] bg-card/50 p-3", className)}>
      <div className="flex items-center gap-2">
        <ListVideoIcon className="size-4 text-primary" />
        <p className="text-sm font-semibold">Что смотрим дальше</p>
        {canPropose ? <button type="button" onClick={onPropose} className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
          <PlusIcon className="size-3.5" />
          Предложить
        </button> : <Link to="/support" className="ml-auto rounded-lg px-2 py-2 text-xs text-primary">Предложения с PRO</Link>}
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin]">
        {hasNext && (
          <div className="flex w-[80%] snap-start sm:w-56 shrink-0 items-center gap-2.5 rounded-xl bg-primary/[0.07] p-2 ring-1 ring-primary/25">
            {anime.imageUrl && <img src={imageSrc(anime.imageUrl, 240)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-10 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Следующая серия</p>
              <p className="truncate text-sm font-medium">Серия {episode + 1}</p>
              <p className="text-[11px] text-muted-foreground">{official ? "По результатам голосования" : autoNext ? "Включится сама в конце" : "Автопереход выключен"}</p>
            </div>
            {official && <button type="button" aria-label="Голосовать за следующую серию" aria-pressed={!!myId && nextVotes.includes(myId)}
              onClick={() => void apiRequest(`/party/${code}/vote-next`, { method: "POST" }).catch((error: unknown) => toast.error(error instanceof ApiRequestError ? error.message : "Не получилось проголосовать"))}
              className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs", myId && nextVotes.includes(myId) ? "bg-primary/15 text-primary" : "bg-foreground/5 text-muted-foreground")}><HeartIcon className="size-3.5" />{nextVotes.length}</button>}
            {canControl && (
              <button type="button" onClick={onNextEpisode} title="Включить сейчас" className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <SkipForwardIcon className="size-4" />
              </button>
            )}
          </div>
        )}
        {queue.map((q) => {
          const mine = myId != null && q.votes.includes(myId);
          return (
            <div key={q.anime.id} className="flex w-[80%] snap-start sm:w-56 shrink-0 items-center gap-2.5 rounded-xl bg-foreground/[0.04] p-2">
              {q.anime.imageUrl && <img src={imageSrc(q.anime.imageUrl, 240)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-10 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-tight">{q.anime.titleLocalized || q.anime.title}</p>
                <p className="text-xs text-primary">Серия {q.episode ?? 1}</p>
                <p className="truncate text-[11px] text-muted-foreground">предложил(а) {q.by}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => vote(q.anime.id)}
                  title={mine ? "Убрать голос" : "Хочу это"}
                  className={cn("inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold tabular-nums", mine ? "bg-rose-500/15 text-rose-400" : "text-muted-foreground hover:text-foreground")}
                >
                  <HeartIcon className={cn("size-3.5", mine && "fill-current")} />
                  {q.votes.length}
                </button>
                {isHost && (
                  <button type="button" onClick={() => play(q.anime.id, q.episode ?? 1)} title="Включить для всех" className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <PlayIcon className="size-3.5 fill-current" />
                  </button>
                )}
                {(isHost || mine) && !isHost && (
                  <button type="button" onClick={() => remove(q.anime.id)} title="Убрать" className="text-[10px] text-muted-foreground hover:text-rose-400">
                    убрать
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!hasNext && queue.length === 0 && (
          <p className="py-3 text-xs text-muted-foreground">Это последняя серия. Предложите, что смотреть потом — остальные проголосуют.</p>
        )}
      </div>
    </section>
  );
}
