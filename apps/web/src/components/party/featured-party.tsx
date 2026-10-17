import type { PartySnapshot } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRightIcon, RadioIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";

export function FeaturedParty() {
  const { data, isPending, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["party-featured"], queryFn: ({ signal }) => apiRequest<{ party: PartySnapshot | null }>("/party/featured", { signal }),
    refetchInterval: 10_000, staleTime: 5_000, retry: 1,
  });
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(timer); }, []);
  if (isPending) return <Skeleton className="h-64 rounded-2xl sm:h-56" />;
  const party = data?.party;
  if (!party) return <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-5">
    <RadioIcon className="size-6 shrink-0 text-primary" />
    <div className="min-w-0 flex-1"><h2 className="font-display text-lg">Общий эфир</h2><p className="mt-1 text-sm text-muted-foreground">{isError ? "Не удалось загрузить эфир. Комнаты зрителей доступны ниже." : "Подбираем аниме с доступным потоком. Пока можно собрать свою комнату."}</p></div>
    <button type="button" onClick={() => void refetch()} className="rounded-lg px-3 py-2 text-xs text-primary hover:bg-primary/10">Обновить</button>
  </section>;
  const title = party.anime.titleLocalized || party.anime.title;
  const elapsed = party.playback.position + (party.playback.playing ? (Date.now() - dataUpdatedAt) / 1000 + (party.now - party.playback.updatedAt) / 1000 : 0);
  const duration = party.durationSeconds ?? 0;
  const left = duration > 0 ? Math.max(0, Math.ceil((duration - elapsed) / 60)) : null;
  return <section aria-label="Общий эфир" className="relative isolate overflow-hidden rounded-2xl border border-primary/20 bg-card">
    <div className="relative grid sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="relative h-52 overflow-hidden bg-secondary sm:h-auto">
        <img src={imageSrc(party.anime.imageUrl)} alt={title} className="size-full object-cover object-[center_25%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent sm:bg-gradient-to-r" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white"><span className="size-1.5 rounded-full bg-emerald-400" />В эфире</span>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3 px-5 pb-5 pt-1 sm:py-5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"><RadioIcon className="size-4" />Общий эфир AnimeShadow</span>
        <h2 className="break-words font-display text-xl leading-tight sm:text-2xl">{title}</h2>
        <p className="text-sm text-muted-foreground">Серия {party.playback.episode}{party.anime.episodes ? ` из ${party.anime.episodes}` : ""}{left != null ? ` · до продолжения ${left} мин` : ""}</p>
        <p className="max-w-2xl text-sm text-muted-foreground">Один момент для всех. Заходите в эфир, общайтесь и выбирайте голосованием, что смотреть дальше.</p>
        {duration > 0 && <div role="progressbar" aria-label="Прогресс общего эфира" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(duration, Math.floor(elapsed))} className="h-1 w-full max-w-lg overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, elapsed / duration * 100)}%` }} /></div>}
        <div className="flex w-full flex-wrap items-center justify-between gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><UsersIcon className="size-4" />Зрителей: {party.members.length}</span>
          <Link to={`/party/${party.code}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Присоединиться<ArrowUpRightIcon className="size-4" /></Link>
        </div>
      </div>
    </div>
  </section>;
}
