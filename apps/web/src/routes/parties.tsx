import { PARTY_MAX, type PartyListing, type PartyVisibility } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import { CrownIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { VISIBILITY } from "@/components/party/visibility";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHero } from "@/components/common/page-hero";
import { PartyPicker } from "@/components/party-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { useIsPro } from "@/components/promo/promo-offer";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

type Filter = "all" | "friends" | "mine";

/**
 * "Совместный просмотр": the rooms going on right now — what's on, which
 * episode and minute, how many of ten are in, whose room it is — to walk
 * into one; and a way to open one's own, choosing who sees it.
 */
export function Component() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [visibility, setVisibility] = useState<PartyVisibility>("public");
  const { data, isPending, dataUpdatedAt } = useQuery({
    queryKey: ["party-list", status],
    queryFn: ({ signal }) => apiRequest<{ rooms: PartyListing[] }>("/party", { signal }),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
  // The minute on each card moves on by itself between refreshes.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const fetchedAt = dataUpdatedAt;

  const rooms = (data?.rooms ?? []).filter((r) => {
    if (filter === "friends" && !r.friends) return false;
    if (filter === "mine" && !r.mine) return false;
    const term = q.trim().toLowerCase();
    if (term && !`${r.anime.titleLocalized ?? ""} ${r.anime.title}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const total = data?.rooms.reduce((n, r) => n + r.members, 0) ?? 0;

  const isPro = useIsPro();
  const create = () => {
    if (status !== "authenticated") {
      navigate("/login", { state: { from: "/party" } });
      return;
    }
    if (isPro === false) {
      toast("Создавать комнаты можно с PRO", {
        description: "Заходить в чужие комнаты — всем, бесплатно.",
        action: { label: "Получить PRO", onClick: () => navigate("/support") },
      });
      return;
    }
    setPicking(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <PageHero
        icon={UsersIcon}
        eyebrow="Вместе"
        title="Совместный просмотр"
        lead="Комнаты, где смотрят прямо сейчас: одна серия и один момент у всех, чат и реакции. Заходите в открытую или создайте свою — до 10 человек."
        aside={
          <button
            type="button"
            onClick={create}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-95"
          >
            <PlusIcon className="size-4" />
            Создать комнату
            {isPro === false && <span className="rounded-md bg-white/25 px-1.5 text-[10px] font-bold">PRO</span>}
          </button>
        }
      >
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          Сейчас {data?.rooms.length ?? 0} {plural(data?.rooms.length ?? 0, "комната", "комнаты", "комнат")} · {total} {plural(total, "зритель", "зрителя", "зрителей")}
        </p>
      </PageHero>

      {/* Filters. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-1">
          {(
            [
              ["all", "Все"],
              ["friends", "Друзей"],
              ["mine", "Мои"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
                filter === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти по аниме"
            className="h-10 w-full rounded-xl border border-[var(--accent-line-soft)] bg-background/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </label>
      </div>

      {/* The rooms. */}
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--accent-line-soft)] px-6 py-14 text-center">
          <UsersIcon className="size-10 text-muted-foreground" />
          <p className="font-medium">{filter === "all" && !q ? "Сейчас никто не смотрит вместе" : "Таких комнат нет"}</p>
          <p className="max-w-sm text-sm text-muted-foreground">Создайте свою комнату и позовите друзей — по ссылке, QR-коду или прямо с сайта.</p>
          <button type="button" onClick={create} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <PlusIcon className="size-4" />
            Создать комнату
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <RoomCard key={r.code} room={r} drift={r.playing ? (Date.now() - fetchedAt) / 1000 : 0} />
          ))}
        </div>
      )}

      <PartyPicker
        open={picking}
        onOpenChange={setPicking}
        hint="Выберите аниме — серию выберете в комнате."
        header={
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(VISIBILITY) as PartyVisibility[]).map((v) => {
              const Icon = VISIBILITY[v].icon;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  title={VISIBILITY[v].hint}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-colors",
                    visibility === v ? "border-primary/50 bg-primary/12 text-primary" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {VISIBILITY[v].label}
                </button>
              );
            })}
          </div>
        }
        onPick={async ({ anime, episode }) => {
          try {
            const { code } = await apiRequest<{ code: string }>("/party", { method: "POST", body: { animeId: anime.id, episode, visibility } });
            setPicking(false);
            navigate(`/party/${code}`);
          } catch (error) {
            toast.error(error instanceof ApiRequestError ? error.message : "Не получилось создать комнату");
          }
        }}
      />
    </div>
  );
}

function RoomCard({ room, drift }: { room: PartyListing; drift: number }) {
  const title = room.anime.titleLocalized || room.anime.title;
  const V = VISIBILITY[room.visibility];
  return (
    <article className="group relative isolate flex flex-col overflow-hidden rounded-2xl border border-[var(--accent-line-soft)] bg-card/60 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary/40">
      {room.anime.imageUrl && (
        <img src={imageSrc(room.anime.imageUrl)} alt="" aria-hidden className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-20 blur-2xl" />
      )}
      <div className="flex gap-3 p-3">
        <span className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/10">
          {room.anime.imageUrl && <img src={imageSrc(room.anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
          <span className={cn("absolute left-1 top-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold", room.playing ? "bg-rose-500 text-white" : "bg-black/70 text-white/80")}>
            {room.playing ? <span className="size-1.5 animate-pulse rounded-full bg-white" /> : <PauseIcon className="size-2.5" />}
            {room.playing ? "LIVE" : "пауза"}
          </span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 font-display text-base leading-tight">{title}</p>
          <p className="text-xs text-muted-foreground">
            Серия {room.episode} · {clock(room.position + drift)}
          </p>
          <p className="flex items-center gap-1.5 text-xs">
            <span className="grid size-5 place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold">
              {room.host.avatarUrl ? <img src={imageSrc(room.host.avatarUrl)} alt="" className="size-full object-cover" /> : room.host.name.charAt(0)}
            </span>
            <span className="truncate">{room.host.name}</span>
            <CrownIcon className="size-3 shrink-0 fill-amber-400 text-amber-400" />
          </p>
          <span className="mt-auto flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-muted-foreground">
              <V.icon className="size-3" />
              {V.label}
            </span>
            {room.friends && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-500 dark:text-emerald-300">Друзья здесь</span>}
            {room.mine && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">Вы в комнате</span>}
          </span>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-[var(--accent-line-soft)] p-3">
        <span className="flex -space-x-2">
          {room.faces.map((f) => (
            <span key={f.id} title={f.name} className="grid size-7 place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card">
              {f.avatarUrl ? <img src={imageSrc(f.avatarUrl)} alt="" className="size-full object-cover" /> : f.name.charAt(0)}
            </span>
          ))}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          <b className="text-foreground">{room.members}</b>/{PARTY_MAX}
        </span>
        {room.full ? (
          <span className="ml-auto rounded-xl bg-foreground/[0.07] px-3 py-2 text-xs font-semibold text-muted-foreground">Мест нет</span>
        ) : (
          <Link to={`/party/${room.code}`} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95">
            <PlayIcon className="size-3.5 fill-current" />
            {room.mine ? "Вернуться" : "Войти"}
          </Link>
        )}
      </div>
    </article>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
