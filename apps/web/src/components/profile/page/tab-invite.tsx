import type { ReferralRewardState, ReferralState } from "@animeshadow/shared";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CrownIcon,
  GiftIcon,
  HourglassIcon,
  LockIcon,
  MedalIcon,
  PenLineIcon,
  SendIcon,
  Share2Icon,
  SparklesIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ReactionGif } from "@/components/common/reaction-gif";
import { PromoTimer } from "@/components/promo/promo-offer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { inviteLink, useClaimReferral, useReferrals } from "@/lib/referral";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ru", { day: "numeric", month: "long" });

/** Russian plural: 1 друг, 2 друга, 5 друзей. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function rewardIcon(r: ReferralRewardState) {
  if (r.title) return PenLineIcon;
  if (r.proDays && r.badge) return CrownIcon;
  if (r.badge) return MedalIcon;
  return CrownIcon;
}

/**
 * Inviting friends, on one's own profile: the code and the link to send,
 * how many came and how much they have watched, the two ladders of rewards
 * (taken with a button), the friends themselves, and one's PRO with how
 * long it has left.
 */
export function InviteTab() {
  const { data, isPending } = useReferrals();
  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <InviteHero state={data} />
      <Stats state={data} />
      <Ladder state={data} track="friends" />
      <Ladder state={data} track="hours" />
      <Friends state={data} />
      <HowItWorks />
    </div>
  );
}

function InviteHero({ state }: { state: ReferralState }) {
  const link = inviteLink(state.code);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? state.code : link);
      setCopied(what);
      toast.success(what === "code" ? "Код скопирован" : "Ссылка скопирована", { description: "Отправь её другу — и следи за прогрессом здесь" });
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Не получилось скопировать", { description: link });
    }
  };
  const text = "Смотрю аниме на AnimeShadow — без рекламы на своём плеере, со списком и прогрессом. Залетай, первый месяц PRO в подарок:";
  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: "AnimeShadow", text, url: link }).catch(() => undefined);
    } else void copy("link");
  };
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[radial-gradient(120%_120%_at_0%_0%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_55%),radial-gradient(100%_120%_at_100%_100%,rgb(217_70_239/0.14),transparent_60%)] p-5 sm:p-7">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <GiftIcon className="size-3.5" />
              Приглашай друзей — получай PRO
            </span>
            <h2 className="font-display text-2xl leading-tight sm:text-3xl">Чем больше друзей, тем больше наград</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-foreground/75">
              Отправь ссылку или код. За каждого друга и за каждый час, что вы вместе смотрите, растут две шкалы — на них месяцы PRO,
              редкие значки и своя приписка к нику. Другу — первый месяц PRO в подарок.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <button
              type="button"
              onClick={() => void copy("code")}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/50 bg-background/50 px-4 py-3 text-left transition-colors hover:bg-background/70 sm:w-56"
              aria-label="Скопировать код"
            >
              <span className="flex flex-col">
                <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Твой код</span>
                <span className="font-mono text-xl font-bold tracking-[0.18em]">{state.code}</span>
              </span>
              {copied === "code" ? <CheckIcon className="size-5 text-emerald-400" /> : <CopyIcon className="size-5 text-muted-foreground group-hover:text-foreground" />}
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border/60 bg-background/50 p-1.5 pl-4">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">{link}</span>
              <button
                type="button"
                onClick={() => void copy("link")}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary via-rose-500 to-fuchsia-500 px-4 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
              >
                {copied === "link" ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied === "link" ? "Готово" : "Копировать"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/20"
            >
              <SendIcon className="size-3.5" />
              В Telegram
            </a>
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 px-3 text-xs font-semibold transition-colors hover:border-foreground/30"
            >
              <Share2Icon className="size-3.5" />
              Поделиться
            </button>
          </div>
        </div>
        <div className="relative mx-auto hidden w-44 lg:block">
          <ReactionGif category="hug" className="aspect-square w-full shadow-xl shadow-black/30" />
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-semibold shadow-lg">
            Вместе веселее 💞
          </span>
        </div>
      </div>
    </section>
  );
}

function Stats({ state }: { state: ReferralState }) {
  const next = (track: "friends" | "hours") => state.rewards.find((r) => r.track === track && !r.claimed && !r.claimable);
  const nf = next("friends");
  const nh = next("hours");
  const tiles = [
    { icon: UsersIcon, value: state.friends.total, label: plural(state.friends.total, "друг пришёл", "друга пришли", "друзей пришли"), tone: "text-sky-300 bg-sky-500/15" },
    {
      icon: CheckIcon,
      value: state.friends.counted,
      label: "засчитано",
      hint: "друг засчитывается после первого часа просмотра",
      tone: "text-emerald-300 bg-emerald-500/15",
    },
    { icon: ClockIcon, value: state.hours, label: "часов посмотрели друзья", tone: "text-amber-300 bg-amber-400/15" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(({ icon: Icon, value, label, hint, tone }) => (
        <div key={label} className="flex flex-col gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4" title={hint}>
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tone)}>
            <Icon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display text-2xl tabular-nums leading-none">{value}</span>
            <span className="mt-1 text-xs text-muted-foreground">{label}</span>
          </span>
        </div>
      ))}
      <ProTile state={state} />
      {(nf || nh) && (
        <div className="col-span-2 flex flex-col gap-1.5 rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 text-sm lg:col-span-4 lg:flex-row lg:items-center lg:gap-6">
          <span className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-4 text-primary" />
            Следующие награды:
          </span>
          {nf && (
            <span className="text-foreground/80">
              ещё <b className="text-foreground">{nf.at - state.friends.counted}</b> {plural(nf.at - state.friends.counted, "друг", "друга", "друзей")} — {nf.label.toLowerCase()}
            </span>
          )}
          {nh && (
            <span className="text-foreground/80">
              ещё <b className="text-foreground">{Math.max(0, Math.ceil((nh.at - state.hours) * 10) / 10)} ч</b> просмотра друзей — {nh.label.toLowerCase()}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** One's PRO now: until when, with a timer — or for good, or not yet. */
function ProTile({ state }: { state: ReferralState }) {
  const until = state.pro.until ?? state.pro.trialUntil;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/[0.07] p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
        <CrownIcon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        {state.pro.active && !until ? (
          <>
            <span className="font-display text-lg leading-none">PRO навсегда</span>
            <span className="text-xs text-muted-foreground">месяцы с наград не нужны — но значки твои</span>
          </>
        ) : state.pro.active && until ? (
          <>
            <span className="text-sm font-semibold leading-none">PRO до {fmtDate(until)}</span>
            <PromoTimer until={new Date(until)} className="text-[10.5px]" />
            {state.pro.trialUntil && !state.pro.until && <span className="text-[10.5px] text-muted-foreground">подарочный месяц</span>}
          </>
        ) : (
          <>
            <span className="text-sm font-semibold leading-none">Без PRO</span>
            <span className="text-xs text-muted-foreground">награды за друзей включат его</span>
          </>
        )}
      </span>
    </div>
  );
}

function Ladder({ state, track }: { state: ReferralState; track: "friends" | "hours" }) {
  const claim = useClaimReferral();
  const steps = state.rewards.filter((r) => r.track === track);
  const value = track === "friends" ? state.friends.counted : state.hours;
  const top = steps[steps.length - 1]?.at ?? 1;
  // The bar fills between milestones evenly, so the early steps aren't squeezed.
  const passed = steps.filter((s) => value >= s.at).length;
  const nextStep = steps[passed];
  const prevAt = passed > 0 ? steps[passed - 1]!.at : 0;
  const within = nextStep ? (value - prevAt) / (nextStep.at - prevAt) : 1;
  const fill = Math.min(100, ((passed + (nextStep ? within : 0)) / steps.length) * 100);
  const take = (r: ReferralRewardState) =>
    claim.mutate(r.id, {
      onSuccess: () =>
        toast.success("Награда получена! 🎉", {
          description: r.proDays ? `${r.label} — PRO продлён, таймер уже идёт` : r.label,
        }),
      onError: (e) => toast.error("Не получилось", { description: e instanceof ApiRequestError ? e.message : "Попробуйте ещё раз" }),
    });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg">
            {track === "friends" ? <UserPlusIcon className="size-5 text-sky-300" /> : <HourglassIcon className="size-5 text-amber-300" />}
            {track === "friends" ? "Шкала друзей" : "Шкала часов"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {track === "friends"
              ? "Сколько друзей пришло по твоему коду и посмотрело хотя бы час"
              : "Сколько часов аниме посмотрели все твои друзья вместе"}
          </p>
        </div>
        <span className="font-display text-xl tabular-nums">
          {value}
          <span className="text-sm text-muted-foreground">
            {" "}
            / {top} {track === "friends" ? "" : "ч"}
          </span>
        </span>
      </header>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700",
            track === "friends" ? "bg-gradient-to-r from-sky-400 to-primary" : "bg-gradient-to-r from-amber-300 to-primary",
          )}
          style={{ width: `${fill}%` }}
        />
      </div>

      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((r) => {
          const Icon = rewardIcon(r);
          const left = Math.max(0, Math.ceil((r.at - value) * 10) / 10);
          return (
            <li
              key={r.id}
              className={cn(
                "relative flex flex-row items-center gap-3 rounded-xl border p-3 sm:flex-col sm:items-start sm:gap-2",
                r.claimed
                  ? "border-emerald-400/30 bg-emerald-500/[0.07]"
                  : r.claimable
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_24px_-6px_var(--primary)]"
                    : "border-border/50 bg-background/30",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg",
                  r.claimed ? "bg-emerald-500/15 text-emerald-300" : r.claimable ? "bg-primary/20 text-primary" : "bg-foreground/[0.06] text-muted-foreground",
                )}
              >
                {r.claimed ? <CheckIcon className="size-4" /> : r.claimable ? <Icon className="size-4" /> : <LockIcon className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {r.at} {track === "friends" ? plural(r.at, "друг", "друга", "друзей") : "ч"}
                </span>
                <span className="text-[13px] font-semibold leading-snug">{r.label}</span>
                {!r.claimed && !r.claimable && (
                  <span className="text-[11px] text-muted-foreground">
                    ещё {left} {track === "friends" ? plural(left, "друг", "друга", "друзей") : "ч"}
                  </span>
                )}
              </span>
              {r.claimable && (
                <button
                  type="button"
                  disabled={claim.isPending}
                  onClick={() => take(r)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-primary to-fuchsia-500 px-3 text-xs font-bold text-white shadow-md shadow-primary/30 transition-transform active:scale-95 disabled:opacity-60 sm:w-full sm:justify-center"
                >
                  <GiftIcon className="size-3.5" />
                  Забрать
                </button>
              )}
              {r.claimed && <span className="shrink-0 text-[11px] font-semibold text-emerald-300 sm:mt-auto">Получено</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Friends({ state }: { state: ReferralState }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-display text-lg">
        <UsersIcon className="size-5 text-primary" />
        Твои друзья <span className="text-sm text-muted-foreground">{state.people.length}</span>
      </h3>
      {state.people.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <ReactionGif category="pout" className="size-20" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Пока никого. Скинь ссылку в чат с друзьями — первый, кто придёт, принесёт значок «Проводник».
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {state.people.map((p) => {
            const toCount = Math.max(0, Math.ceil(60 - p.hours * 60));
            const body = (
              <>
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
                  {p.avatarUrl ? <img src={imageSrc(p.avatarUrl)} alt="" loading="lazy" className="size-full object-cover" /> : p.displayName.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{p.displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    с {fmtDate(p.joinedAt)} · {p.hours} ч
                  </span>
                </span>
                {p.counted ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">засчитан</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] text-muted-foreground">ещё {toCount} мин</span>
                )}
              </>
            );
            return (
              <li key={p.id}>
                {p.username ? (
                  <Link to={`/profile/${p.username}`} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-2.5 transition-colors hover:border-foreground/25">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: Share2Icon, title: "Отправь ссылку", text: "Или просто код — друг введёт его при регистрации." },
    { icon: UserPlusIcon, title: "Друг регистрируется", text: "И сразу получает месяц PRO в подарок." },
    { icon: ClockIcon, title: "Смотрите аниме", text: "Друг засчитывается после первого часа, а часы всех друзей копятся на второй шкале." },
    { icon: GiftIcon, title: "Забирай награды", text: "PRO добавляется к текущему и сам выключится, когда время выйдет." },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map(({ icon: Icon, title, text }, i) => (
        <div key={title} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/30 p-4">
          <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] text-primary">{i + 1}</span>
            <Icon className="size-4" />
          </span>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
      ))}
    </section>
  );
}
