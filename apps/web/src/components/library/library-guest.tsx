import type { AnimeSummary, LibraryStatus } from "@animeshadow/shared";
import {
  BarChart3Icon,
  CalendarRangeIcon,
  HistoryIcon,
  LogInIcon,
  NotebookPenIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LogoWatermark } from "@/components/brand/logo-watermark";
import { PromoStrip } from "@/components/promo/promo-offer";
import { imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useBrowse } from "@/lib/query";
import { cn } from "@/lib/utils";
import { STATUS_META } from "./library-meta";

/** How the preview list fills in: a status, how far along, a score. */
const PREVIEW: Array<{ status: LibraryStatus; label: string; progress: number; score?: number }> = [
  { status: "WATCHING", label: "Смотрю", progress: 0.62 },
  { status: "COMPLETED", label: "Просмотрено", progress: 1, score: 10 },
  { status: "PLANNED", label: "В планах", progress: 0 },
  { status: "WATCHING", label: "Смотрю", progress: 0.25 },
  { status: "COMPLETED", label: "Просмотрено", progress: 1, score: 9 },
  { status: "ON_HOLD", label: "Отложено", progress: 0.4 },
];

const PERKS = [
  { icon: HistoryIcon, title: "С той же минуты", text: "Серии отмечаются сами — продолжишь на любом устройстве." },
  { icon: CalendarRangeIcon, title: "Планы на сезон", text: "Всё интересное — в «В планах», ничего не потеряется." },
  { icon: NotebookPenIcon, title: "Оценки и заметки", text: "Свои 10 баллов и пара слов к каждому тайтлу." },
  { icon: BarChart3Icon, title: "Статистика", text: "Часы, жанры, уровни и достижения в профиле." },
];

/**
 * The list page for a guest: not a "please sign in" stub but the list
 * itself, as it would look — real posters marked watching, done, planned,
 * with progress and scores — beside why it is worth having, the welcome
 * offer and the way in.
 */
export function LibraryGuest() {
  const labels = useLabels();
  const { data } = useBrowse({ orderBy: "popularity", sort: "desc", page: 1, perPage: 6 });
  const posters: AnimeSummary[] = data?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section className="relative isolate overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] bg-[radial-gradient(110%_120%_at_0%_0%,color-mix(in_srgb,var(--primary)_20%,transparent),transparent_55%),radial-gradient(90%_110%_at_100%_100%,rgb(56_189_248/0.10),transparent_60%)] p-5 sm:p-8">
        <LogoWatermark className="-bottom-16 -left-12 size-80 text-primary/[0.06]" />
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <SparklesIcon className="size-3.5" />
                Мой список
              </span>
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">Всё, что ты смотришь, — в одном месте</h1>
              <p className="max-w-xl text-sm leading-relaxed text-foreground/75 sm:text-base">
                Что смотришь сейчас, что уже досмотрел и что ждёт своей очереди. Прогресс по сериям сохраняется сам — открыл
                тайтл и продолжил ровно оттуда, где остановился.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["WATCHING", "PLANNED", "COMPLETED", "ON_HOLD", "DROPPED"] as const).map((s) => {
                const meta = STATUS_META[s];
                return (
                  <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs font-medium">
                    <meta.Icon className={cn("size-3.5", meta.text)} />
                    {labels.statusLabel(s)}
                  </span>
                );
              })}
            </div>

            <PromoStrip className="max-w-xl" />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-6 text-[15px] font-bold text-white shadow-xl shadow-primary/35 transition-transform hover:-translate-y-0.5 active:scale-95"
              >
                <SparklesIcon className="size-4" />
                Создать список — бесплатно
              </Link>
              <Link
                to="/login"
                state={{ from: "/library" }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/40 px-5 text-sm font-semibold transition-colors hover:border-foreground/30"
              >
                <LogInIcon className="size-4" />
                Уже есть аккаунт
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">20 секунд на регистрацию · без карты и подписок</p>
          </div>

          {/* The list as it would look — real titles, made-up progress. */}
          <div className="relative">
            <span className="absolute -top-3 right-3 z-10 rounded-full border border-primary/30 bg-card px-3 py-1 text-[11px] font-semibold shadow-lg">
              Так будет выглядеть твой список
            </span>
            <ul className="grid grid-cols-3 gap-2.5 rounded-2xl border border-border/50 bg-background/40 p-3 sm:gap-3">
              {PREVIEW.map((p, i) => {
                const anime = posters[i];
                const meta = STATUS_META[p.status];
                const eps = anime?.episodes ?? 12;
                return (
                  <li
                    key={i}
                    className="flex animate-in flex-col gap-1.5 duration-500 fade-in-0 slide-in-from-bottom-2"
                    style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
                      {anime?.imageUrl && <img src={imageSrc(anime.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9.5px] font-semibold text-white backdrop-blur">
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {p.label}
                      </span>
                      {p.score && (
                        <span className="absolute bottom-2.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-300 backdrop-blur">
                          <StarIcon className="size-2.5 fill-current" />
                          {p.score}
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                        <span className={cn("block h-full", meta.bar)} style={{ width: `${p.progress * 100}%` }} />
                      </span>
                    </div>
                    <span className="truncate text-[11px] font-medium">{anime ? labels.title(anime) : " "}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {eps <= 1
                        ? p.progress >= 1
                          ? "фильм · просмотрен"
                          : "фильм"
                        : p.progress === 0
                          ? "ещё не начато"
                          : `${Math.round(eps * p.progress)}/${eps} эп.`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PERKS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
              <Icon className="size-5" />
            </span>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
