import type { PartySnapshot } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRightIcon, PauseIcon, RadioIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";

export function FeaturedParty() {
  const { data, isPending, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["party-featured"],
    queryFn: ({ signal }) => apiRequest<{ party: PartySnapshot | null; rooms?: PartySnapshot[] }>("/party/featured", { signal }),
    refetchInterval: 15_000, staleTime: 10_000, retry: 1,
  });
  const rooms = data?.rooms ?? (data?.party ? [data.party] : []);
  const playing = rooms.some((room) => room.playback.playing);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [playing]);
  if (isPending) return <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-72 rounded-2xl" />)}</div>;
  if (!rooms.length) return <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/40 p-5">
    <RadioIcon className="size-6 shrink-0 text-primary" /><p className="min-w-0 flex-1 text-sm text-muted-foreground">{isError ? "Не удалось загрузить общие залы." : "Подбираем доступные потоки для общих залов."}</p>
    <button type="button" onClick={() => void refetch()} className="rounded-lg px-3 py-2 text-xs text-primary">Обновить</button>
  </section>;
  return <section aria-label="Общие комнаты" className="flex flex-col gap-3">
    <div><h2 className="font-display text-xl">Общие залы</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">PRO предлагает тайтлы и серии, голосовать могут все. Пустые залы ждут на паузе.</p></div>
    <div className="grid gap-3 md:grid-cols-3">{rooms.map((party) => {
      const title = party.anime.titleLocalized || party.anime.title;
      const elapsed = party.playback.position + (party.playback.playing ? Math.max(0, Date.now() - dataUpdatedAt + party.now - party.playback.updatedAt) / 1000 : 0);
      const duration = party.durationSeconds ?? 0;
      return <article key={party.code} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/20 bg-card">
        <div className="relative h-32 overflow-hidden bg-secondary">
          <img src={imageSrc(party.anime.coverUrl || party.anime.imageUrl, 960)} alt="" loading="lazy" decoding="async" className="size-full object-cover object-center" onError={(event) => { const fallback = imageSrc(party.anime.imageUrl, 640); if (fallback && event.currentTarget.getAttribute("src") !== fallback) event.currentTarget.src = fallback; }} />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/75 px-2.5 py-1 text-xs font-medium text-white">{party.playback.playing ? <RadioIcon className="size-3" /> : <PauseIcon className="size-3" />}{party.playback.playing ? "Смотрим" : "На паузе"}</span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <p className="text-xs font-medium text-primary">{party.name || "Общий зал"}</p>
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 sm:min-h-10">{title}</h3>
          <p className="text-xs text-muted-foreground">Серия {party.playback.episode} · зрителей {party.members.length}</p>
          {duration > 0 && <div role="progressbar" aria-label={`Прогресс: ${party.name}`} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Math.min(duration, Math.floor(elapsed))} className="h-1 overflow-hidden rounded-full bg-foreground/10"><div className="h-full bg-primary" style={{ width: `${Math.min(100, elapsed / duration * 100)}%` }} /></div>}
          <Link to={`/party/${party.code}`} className="mt-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><UsersIcon className="size-4" />Присоединиться<ArrowUpRightIcon className="size-4" /></Link>
        </div>
      </article>;
    })}</div>
  </section>;
}
