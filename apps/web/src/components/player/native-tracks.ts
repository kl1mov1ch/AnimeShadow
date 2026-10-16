import type { EngineTracks } from "./hls-engine";

type AudioTrack = { label: string; language: string; enabled: boolean };
type AudioTrackList = EventTarget & { readonly length: number; [index: number]: AudioTrack };
type NativeVideo = HTMLVideoElement & { audioTracks?: AudioTrackList };

export const EMPTY_TRACKS: EngineTracks = { audio: [], subtitles: [], audioId: -1, subtitleId: -1 };

function subtitleEntries(video: HTMLVideoElement) {
  return Array.from(video.textTracks, (track, id) => ({ track, id }))
    .filter(({ track }) => track.kind === "subtitles" || track.kind === "captions");
}

export function readNativeTracks(video: NativeVideo): EngineTracks {
  const audio = video.audioTracks ? Array.from(video.audioTracks) : [];
  const subtitles = subtitleEntries(video);
  return {
    audio: audio.map((track, id) => ({ id, label: track.label || track.language || `Дорожка ${id + 1}` })),
    subtitles: subtitles.map(({ track, id }) => ({ id, label: track.label || track.language || `Субтитры ${id + 1}` })),
    audioId: audio.findIndex((track) => track.enabled),
    subtitleId: subtitles.find(({ track }) => track.mode === "showing")?.id ?? -1,
  };
}

export function pickNativeTrack(video: NativeVideo, kind: "audio" | "subtitles", id: number): void {
  if (kind === "audio" && video.audioTracks?.[id]) {
    Array.from(video.audioTracks).forEach((track, index) => { track.enabled = index === id; });
  } else if (kind === "subtitles") {
    subtitleEntries(video).forEach(({ track, id: index }) => { track.mode = index === id ? "showing" : "disabled"; });
  }
}

export function observeNativeTracks(video: NativeVideo, update: () => void): () => void {
  const lists = [video.textTracks, video.audioTracks].filter((list): list is TextTrackList | AudioTrackList => Boolean(list));
  for (const list of lists) for (const event of ["addtrack", "removetrack", "change"]) list.addEventListener(event, update);
  video.addEventListener("loadedmetadata", update);
  return () => {
    for (const list of lists) for (const event of ["addtrack", "removetrack", "change"]) list.removeEventListener(event, update);
    video.removeEventListener("loadedmetadata", update);
  };
}
