export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  label: string;
  url: string;
  fallbackUrl: string | null;
  sourceUrl: string | null;
  animeId: number;
  animeTitle: string;
  animeHref: string;
  cover: string | null;
}
export interface MusicState {
  queue: MusicTrack[];
  index: number;
  status: "idle" | "loading" | "playing" | "paused" | "error";
  time: number;
  duration: number;
  volume: number;
  failedIds: string[];
}
const INITIAL: MusicState = {
  queue: [],
  index: 0,
  status: "idle",
  time: 0,
  duration: 0,
  volume: 0.7,
  failedIds: [],
};

/** One audio element for the app's lifetime; route components never own playback. */
export class MusicSession {
  private state: MusicState = INITIAL;
  private listeners = new Set<() => void>();
  private audio: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private fallback = false;
  private generation = 0;
  constructor(private createAudio: () => HTMLAudioElement = () => new Audio()) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getAnalyser = () => this.analyser;
  private set(patch: Partial<MusicState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private ensureAudio() {
    if (this.audio) return this.audio;
    const audio = (this.audio = this.createAudio());
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";
    audio.volume = this.state.volume;
    audio.addEventListener("playing", () => this.set({ status: "playing" }));
    audio.addEventListener("waiting", () => {
      if (!audio.paused) this.set({ status: "loading" });
    });
    audio.addEventListener("pause", () => {
      if (this.state.status !== "idle" && this.state.status !== "error")
        this.set({ status: "paused" });
    });
    audio.addEventListener("timeupdate", () => this.set({ time: audio.currentTime }));
    audio.addEventListener("durationchange", () =>
      this.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
    );
    audio.addEventListener("ended", () => {
      if (this.state.index < this.state.queue.length - 1) this.next();
      else this.set({ status: "paused", time: this.state.duration });
    });
    audio.addEventListener("error", () => {
      if (typeof HTMLMediaElement !== "undefined" && !audio.error) return;
      this.playbackError();
    });
    return audio;
  }
  private visualization() {
    if (typeof window === "undefined") return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.75;
        const source = this.context.createMediaElementSource(this.ensureAudio());
        source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio still works when Web Audio is unavailable. */
    }
  }
  private async start() {
    const audio = this.ensureAudio();
    const generation = this.generation;
    this.set({ status: "loading" });
    try {
      await audio.play();
      if (generation === this.generation) this.set({ status: "playing" });
    } catch (error) {
      if (generation !== this.generation || (error as Error).name === "AbortError")
        return;
      if ((error as Error).name === "NotAllowedError") this.set({ status: "paused" });
      else this.playbackError();
    }
  }
  private playbackError() {
    const track = this.state.queue[this.state.index];
    if (!this.fallback && track?.fallbackUrl) {
      this.generation++;
      this.fallback = true;
      this.ensureAudio().src = track.fallbackUrl;
      void this.start();
    } else this.unavailable();
  }
  private unavailable() {
    const track = this.state.queue[this.state.index];
    if (!track) return;
    const failedIds = [...new Set([...this.state.failedIds, track.id])];
    const queue = this.state.queue.filter((item) => item.id !== track.id);
    if (queue.length) {
      const index = Math.min(this.state.index, queue.length - 1);
      this.set({ queue, failedIds });
      this.select(index);
    } else {
      this.close();
      this.set({ failedIds });
    }
  }
  private select(index: number) {
    const track = this.state.queue[index];
    if (!track) return;
    const audio = this.ensureAudio();
    this.generation++;
    this.fallback = false;
    audio.src = track.url;
    this.set({ index, time: 0, duration: 0, status: "loading" });
    this.visualization();
    this.publish();
    void this.start();
  }
  play = (queue: MusicTrack[], index: number) => {
    if (!queue[index]) return;
    const selected = queue[index]!;
    const playable = queue.filter((track) => !this.state.failedIds.includes(track.id));
    const nextIndex = playable.findIndex((track) => track.id === selected.id);
    if (nextIndex < 0) return;
    if (this.state.queue[this.state.index]?.id === selected.id) {
      this.toggle();
      return;
    }
    this.set({ queue: playable });
    this.select(nextIndex);
  };
  toggle = () => {
    if (!this.state.queue.length) return;
    const audio = this.ensureAudio();
    if (this.state.status === "error") {
      this.generation++;
      this.fallback = false;
      audio.src = this.state.queue[this.state.index]!.url;
      audio.load();
    }
    if (!audio.paused) this.pause();
    else {
      this.visualization();
      this.publish();
      void this.start();
    }
  };
  pause = () => {
    this.audio?.pause();
    if (this.state.queue.length && this.state.status !== "error")
      this.set({ status: "paused" });
  };
  next = () => {
    if (this.state.index < this.state.queue.length - 1)
      this.select(this.state.index + 1);
  };
  previous = () => {
    if (this.state.time > 3 || this.state.index === 0) this.seek(0);
    else this.select(this.state.index - 1);
  };
  seek = (time: number) => {
    if (this.audio && Number.isFinite(time)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.state.duration));
      this.set({ time: this.audio.currentTime });
    }
  };
  setVolume = (volume: number) => {
    const value = Math.max(0, Math.min(1, volume));
    if (this.audio) this.audio.volume = value;
    this.set({ volume: value });
  };
  close = () => {
    this.generation++;
    this.audio?.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.set({
      ...INITIAL,
      volume: this.state.volume,
      failedIds: this.state.failedIds,
    });
    void this.context?.suspend().catch(() => {});
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
  };
  private publish() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("as:music-start"));
    const track = this.state.queue[this.state.index];
    if (!track || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || track.animeTitle,
        album: track.animeTitle,
        artwork: track.cover
          ? [{ src: new URL(track.cover, window.location.href).href }]
          : [],
      });
      navigator.mediaSession.setActionHandler("play", () => {
        void this.start();
      });
      navigator.mediaSession.setActionHandler("pause", this.pause);
      navigator.mediaSession.setActionHandler("previoustrack", this.previous);
      navigator.mediaSession.setActionHandler("nexttrack", this.next);
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) this.seek(details.seekTime);
      });
    } catch {
      /* Older browsers may support only some Media Session actions. */
    }
  }
}

export const musicSession = new MusicSession();
if (import.meta.hot) import.meta.hot.dispose(() => musicSession.close());

export function musicTime(time: number) {
  const seconds = Math.max(0, Math.floor(time));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
