import type { AnimeDetail, WatchResponse, WatchSource } from "@animeshadow/shared";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWatchSession } from "@/hooks/use-watch-session";
import { useT } from "@/i18n";
import { useWatchSources } from "@/lib/query";

interface WatchSectionProps {
  anime: Pick<AnimeDetail, "id" | "airing" | "airedFrom">;
  title: string;
  active: boolean;
}

export function WatchSection({ anime, title, active }: WatchSectionProps) {
  const t = useT();
  const releaseDate = anime.airedFrom ? new Date(anime.airedFrom) : null;
  const notYetOut =
    anime.airing === "UPCOMING" &&
    releaseDate != null &&
    releaseDate.getTime() > Date.now();

  const { data, isPending } = useWatchSources(anime.id, active && !notYetOut);

  if (notYetOut && releaseDate) {
    return <Countdown target={releaseDate} />;
  }

  if (isPending && active) {
    return <Skeleton className="mx-auto aspect-video w-full rounded-xl sm:w-[88%]" />;
  }

  if (data?.available && data.sources.length > 0) {
    return <Player data={data} title={title} animeId={anime.id} />;
  }

  const notice =
    data?.reason === "not_configured"
      ? t("watch.notConfigured")
      : data?.reason === "provider_error"
        ? t("watch.providerError")
        : t("watch.notFound");

  return (
    <Alert>
      <AlertDescription>{notice}</AlertDescription>
    </Alert>
  );
}

/* ---------- countdown ---------- */

function Countdown({ target }: { target: Date }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, target.getTime() - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);

  const dateLabel = target.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border bg-card/60 p-8 text-center">
      <p className="text-sm font-medium text-primary">{t("watch.comingOn", { date: dateLabel })}</p>
      <div className="grid grid-cols-4 gap-3">
        {[
          [days, t("watch.days")],
          [hours, t("watch.hours")],
          [minutes, t("watch.minutes")],
          [seconds, t("watch.seconds")],
        ].map(([value, unit], i) => (
          <div
            key={i}
            className="flex min-w-16 flex-col rounded-lg bg-secondary/60 px-3 py-2"
          >
            <span className="font-display text-3xl tabular-nums">
              {String(value).padStart(2, "0")}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {unit}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("watch.willAppearWhenOut")}</p>
    </div>
  );
}

/* ---------- player ---------- */

function Player({
  data,
  title,
  animeId,
}: {
  data: WatchResponse;
  title: string;
  animeId: number;
}) {
  const t = useT();
  const [selectedId, setSelectedId] = useState(data.sources[0]?.id ?? "");
  const current = useMemo(
    () => data.sources.find((s) => s.id === selectedId) ?? data.sources[0],
    [data.sources, selectedId],
  );
  useWatchSession({ animeId, episode: 1, active: true });
  if (!current) return null;

  return (
    <div className="mx-auto flex w-full min-w-0 flex-col gap-3 sm:w-[88%]">
      {data.sources.length > 1 && (
        <div className="flex items-center gap-2">
          <Select value={current.id} onValueChange={setSelectedId}>
            <SelectTrigger
              className="w-full max-w-xs"
              aria-label={t("watch.voiceover")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {sourceLabel(source, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SourceKindBadge source={current} />
        </div>
      )}

      <div className="aspect-video overflow-hidden rounded-xl border bg-black">
        <iframe
          key={current.embedUrl}
          src={current.embedUrl}
          title={`${title} — ${current.title}`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="size-full"
        />
      </div>
    </div>
  );
}

function SourceKindBadge({ source }: { source: WatchSource }) {
  if (source.kind === "voice") return <Badge variant="secondary">RU/VO</Badge>;
  if (source.kind === "subtitles") return <Badge variant="outline">SUB</Badge>;
  return null;
}

function sourceLabel(source: WatchSource, t: ReturnType<typeof useT>): string {
  const parts = [source.title];
  if (source.episodesCount) {
    parts.push(t("watch.episodesCount", { count: source.episodesCount }));
  }
  if (source.quality) parts.push(source.quality);
  return parts.join(" · ");
}
