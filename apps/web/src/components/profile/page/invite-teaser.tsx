import { CopyIcon, GiftIcon, UserPlusIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { inviteLink, useReferrals } from "@/lib/referral";

/**
 * On one's own profile overview: the invite at a glance — the code to copy,
 * friends so far, how far the next reward is (or that one is waiting), and
 * the way to the full page.
 */
export function InviteTeaser() {
  const { data } = useReferrals();
  if (!data) return null;
  const ready = data.rewards.filter((r) => r.claimable).length;
  const next = data.rewards.find((r) => !r.claimed && !r.claimable && r.track === "friends");
  const nextHours = data.rewards.find((r) => !r.claimed && !r.claimable && r.track === "hours");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(data.code));
      toast.success("Ссылка скопирована", { description: "Отправь её другу" });
    } catch {
      toast.error("Не получилось скопировать", { description: inviteLink(data.code) });
    }
  };
  return (
    <section className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border border-primary/30 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_60%)] p-4 sm:flex-row sm:items-center sm:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
        <UserPlusIcon className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-display text-lg leading-tight">Пригласи друга — получи PRO</p>
        <p className="text-sm text-foreground/75">
          {ready > 0 ? (
            <b className="text-primary">Наград ждут: {ready}. Забери их!</b>
          ) : next ? (
            <>
              Друзей: <b>{data.friends.counted}</b>. До «{next.label}» — ещё {next.at - data.friends.counted}
              {nextHours ? `, до «${nextHours.label}» — ещё ${Math.max(0, Math.ceil(nextHours.at - data.hours))} ч` : ""}.
            </>
          ) : (
            "Все награды за друзей собраны — ты легенда."
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-primary/50 bg-background/40 px-3 font-mono text-sm font-bold tracking-[0.15em]"
          aria-label="Скопировать ссылку-приглашение"
        >
          {data.code}
          <CopyIcon className="size-3.5 text-muted-foreground" />
        </button>
        <Link
          to="/profile?tab=invite"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-fuchsia-500 px-4 text-sm font-bold text-white shadow-lg shadow-primary/30"
        >
          <GiftIcon className="size-4" />
          {ready > 0 ? "Забрать" : "Пригласить"}
        </Link>
      </div>
    </section>
  );
}
