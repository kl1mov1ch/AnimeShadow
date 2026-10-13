import { type MyProfile, PRIVACY_PARTS, type ProfilePrivacy, type Visibility } from "@animeshadow/shared";
import {
  ActivityIcon,
  BookmarkIcon,
  BarChart3Icon,
  EyeIcon,
  GlobeIcon,
  HeartIcon,
  LockIcon,
  MessageSquareTextIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserCircle2Icon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";

type Part = keyof ProfilePrivacy;

const LEVELS: Array<{ value: Visibility; label: string; hint: string; tone: string }> = [
  { value: "public", label: "Все", hint: "видят все, даже гости", tone: "bg-emerald-500 text-white" },
  { value: "users", label: "Участники", hint: "видят только вошедшие в аккаунт", tone: "bg-sky-500 text-white" },
  { value: "friends", label: "Друзья", hint: "видят только взаимные подписки", tone: "bg-violet-500 text-white" },
  { value: "private", label: "Только я", hint: "не видит никто, кроме вас", tone: "bg-rose-500 text-white" },
];

const PARTS: Record<Part, { icon: LucideIcon; title: string; text: string; mock: ReactNode }> = {
  profile: {
    icon: UserCircle2Icon,
    title: "Весь профиль",
    text: "Главный выключатель: закрыт — гости видят только имя и аватар, остальное скрыто разом.",
    mock: (
      <div className="flex items-center gap-2">
        <span className="size-8 rounded-full bg-primary/50" />
        <span className="flex flex-col gap-1">
          <span className="h-2 w-16 rounded bg-foreground/40" />
          <span className="h-1.5 w-24 rounded bg-foreground/20" />
          <span className="h-1.5 w-20 rounded bg-foreground/20" />
        </span>
      </div>
    ),
  },
  stats: {
    icon: BarChart3Icon,
    title: "Статистика",
    text: "Часы, серии, досмотренное, средняя оценка и жанры.",
    mock: (
      <div className="grid grid-cols-4 gap-1">
        {["42", "7", "12", "8.1"].map((n) => (
          <span key={n} className="flex flex-col items-center rounded bg-foreground/10 px-1 py-1">
            <b className="text-[10px]">{n}</b>
            <span className="mt-0.5 h-1 w-5 rounded bg-foreground/20" />
          </span>
        ))}
      </div>
    ),
  },
  list: {
    icon: BookmarkIcon,
    title: "Список аниме",
    text: "Что смотрите, в планах, досмотрели — и оценки.",
    mock: (
      <div className="flex gap-1">
        {["bg-emerald-400", "bg-sky-400", "bg-primary", "bg-amber-400"].map((c) => (
          <span key={c} className="relative h-11 w-8 overflow-hidden rounded bg-foreground/15">
            <span className={cn("absolute left-1 top-1 size-1.5 rounded-full", c)} />
            <span className={cn("absolute inset-x-0 bottom-0 h-0.5", c)} />
          </span>
        ))}
      </div>
    ),
  },
  watching: {
    icon: PlayCircleIcon,
    title: "Сейчас смотрю",
    text: "Какой тайтл и серию вы смотрите прямо сейчас.",
    mock: (
      <div className="flex items-center gap-2">
        <span className="h-10 w-7 rounded bg-foreground/15" />
        <span className="flex flex-col gap-1">
          <span className="h-2 w-20 rounded bg-foreground/40" />
          <span className="h-1 w-24 overflow-hidden rounded bg-foreground/15">
            <span className="block h-full w-2/3 bg-emerald-400" />
          </span>
        </span>
      </div>
    ),
  },
  activity: {
    icon: ActivityIcon,
    title: "Активность",
    text: "Лента: что досмотрели, оценили и добавили, и календарь просмотров.",
    mock: (
      <div className="flex flex-col gap-1">
        {[20, 24, 16].map((w, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="h-1.5 rounded bg-foreground/25" style={{ width: `${w * 4}px` }} />
          </span>
        ))}
      </div>
    ),
  },
  favorites: {
    icon: HeartIcon,
    title: "Моя пятёрка",
    text: "Пять любимых тайтлов в начале профиля.",
    mock: (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="relative h-9 w-6 rounded bg-foreground/15">
            <b className="absolute left-0.5 top-0 text-[8px]">{n}</b>
          </span>
        ))}
      </div>
    ),
  },
  achievements: {
    icon: TrophyIcon,
    title: "Достижения",
    text: "Трофеи и витрина под именем.",
    mock: (
      <div className="flex gap-1.5">
        {["bg-amber-400", "bg-violet-400", "bg-sky-400"].map((c) => (
          <span key={c} className={cn("size-7 rounded-full opacity-80 ring-2 ring-white/20", c)} />
        ))}
      </div>
    ),
  },
  social: {
    icon: UsersIcon,
    title: "Подписчики и друзья",
    text: "Сколько их и кто они — числа и списки.",
    mock: (
      <div className="flex items-center gap-2">
        <span className="flex -space-x-2">
          {["bg-primary/70", "bg-sky-400/70", "bg-emerald-400/70"].map((c) => (
            <span key={c} className={cn("size-6 rounded-full ring-2 ring-popover", c)} />
          ))}
        </span>
        <b className="text-[10px]">12 друзей</b>
      </div>
    ),
  },
  wall: {
    icon: MessageSquareTextIcon,
    title: "Стена",
    text: "Сообщения в профиле: закрыта — их не видно и написать нельзя.",
    mock: (
      <div className="flex flex-col gap-1">
        <span className="h-3.5 w-24 rounded-lg rounded-bl-sm bg-foreground/20" />
        <span className="ml-6 h-3.5 w-20 rounded-lg rounded-br-sm bg-primary/40" />
      </div>
    ),
  },
  views: {
    icon: EyeIcon,
    title: "Просмотры профиля",
    text: "Счётчик тех, кто заходил в профиль.",
    mock: (
      <div className="flex items-center gap-1.5">
        <EyeIcon className="size-4 text-amber-300" />
        <b className="text-sm">128</b>
        <span className="text-[10px] text-muted-foreground">просмотров</span>
      </div>
    ),
  },
};

const PRESETS: Array<{ label: string; icon: LucideIcon; apply: () => ProfilePrivacy }> = [
  { label: "Открытый", icon: GlobeIcon, apply: () => all("public") },
  { label: "Для участников", icon: ShieldCheckIcon, apply: () => all("users") },
  { label: "Для друзей", icon: UsersIcon, apply: () => all("friends") },
  { label: "Закрытый", icon: LockIcon, apply: () => all("private") },
];

function all(level: Visibility): ProfilePrivacy {
  return Object.fromEntries(PRIVACY_PARTS.map((p) => [p, level])) as ProfilePrivacy;
}

/**
 * Privacy, part by part: who sees the whole profile, and each block in it.
 * Four levels each; presets set them all at once. Pointing at a row shows a
 * small live preview — the block as it is, then fading behind a lock — so
 * it's clear what a visitor will meet.
 */
export function PrivacySection({ profile }: { profile: MyProfile }) {
  const update = useUpdateProfile();
  const privacy = profile.privacy;
  const save = (next: ProfilePrivacy, done = "Приватность обновлена") =>
    update.mutate({ privacy: next }, { onSuccess: () => toast.success(done) });
  const set = (part: Part, value: Visibility) => save({ ...privacy, [part]: value });
  const preset = PRESETS.find((p) => PRIVACY_PARTS.every((k) => p.apply()[k] === privacy[k]));
  const wholeClosed = privacy.profile !== "public";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <LockIcon className="size-4 text-primary" />
          Приватность
        </h3>
        <p className="text-xs text-muted-foreground">Наведите на строку — покажем, как блок увидят те, кому он закрыт.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={update.isPending}
            onClick={() => save(p.apply(), `Профиль: «${p.label.toLowerCase()}»`)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors",
              preset === p ? "border-primary/60 bg-primary/15 text-foreground" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
            )}
          >
            <p.icon className="size-3.5" />
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {PRIVACY_PARTS.map((part) => {
          const meta = PARTS[part];
          const level = LEVELS.find((l) => l.value === privacy[part]) ?? LEVELS[0]!;
          const master = part === "profile";
          return (
            <Tooltip key={part} delayDuration={250}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "group flex flex-col gap-2.5 rounded-2xl border p-3 transition-colors sm:flex-row sm:items-center sm:gap-4",
                    master ? "border-primary/40 bg-primary/[0.07]" : "border-[var(--accent-line-soft)] hover:border-foreground/20",
                    !master && wholeClosed && "opacity-80",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", master ? "bg-primary/20 text-primary" : "bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground")}>
                      <meta.icon className="size-4" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{meta.title}</span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {meta.text}
                        {!master && wholeClosed && " Пока закрыт весь профиль, он закрывает и это."}
                      </span>
                    </span>
                  </div>
                  <div role="radiogroup" aria-label={meta.title} className="grid shrink-0 grid-cols-4 rounded-xl border border-[var(--accent-line-soft)] bg-background/40 p-0.5 sm:flex">
                    {LEVELS.map((l) => {
                      const on = privacy[part] === l.value;
                      return (
                        <button
                          key={l.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={l.hint}
                          disabled={update.isPending}
                          onClick={() => !on && set(part, l.value)}
                          className={cn(
                            "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                            on ? l.tone : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {l.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="w-64 border border-[var(--accent-line-soft)] bg-popover p-3 text-popover-foreground shadow-xl">
                <p className="mb-2 text-[11px] font-semibold">{meta.title} — как увидят другие</p>
                <div className="pv-frame relative overflow-hidden rounded-lg border border-border/50 bg-background/60 p-3">
                  <div className="pv-mock">{meta.mock}</div>
                  <div className="pv-lock absolute inset-0 grid place-items-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                      <LockIcon className="size-3" />
                      Скрыто
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
                  Сейчас: <b className="text-foreground">{level.label.toLowerCase()}</b> — {level.hint}.
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
