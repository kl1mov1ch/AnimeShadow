import { type MyProfile, TITLE_ICONS, type TitleIcon } from "@animeshadow/shared";
import { CheckIcon, CrownIcon, LockIcon, PenLineIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { TITLE_ICON_COMPONENT, UserTitleBadge } from "@/components/user-title-badge";
import { ApiRequestError } from "@/lib/api";
import { useUpdateProfile } from "@/lib/query";
import { useReferrals } from "@/lib/referral";
import { cn } from "@/lib/utils";

/**
 * The custom nick tag — a few words and an icon beside one's name, seen in
 * comments, on cards and on the profile. Open with PRO, or for good once
 * one's friends have watched 100 hours together (the referral ladder).
 * Locked, it says how to get it.
 */
export function NickTagEditor({ profile }: { profile: MyProfile }) {
  const update = useUpdateProfile();
  const { data: referrals } = useReferrals();
  const unlocked = profile.isPro || referrals?.titleUnlocked === true;
  const [text, setText] = useState(profile.titlePrefix ?? "");
  const [icon, setIcon] = useState<TitleIcon | null>(profile.titleIcon ?? null);
  const dirty = text.trim() !== (profile.titlePrefix ?? "") || icon !== (profile.titleIcon ?? null);

  const save = (body: { titlePrefix: string | null; titleIcon: TitleIcon | null }, done: string) =>
    update.mutate(body, {
      onSuccess: () => toast.success(done),
      onError: (e) => toast.error("Не получилось сохранить", { description: e instanceof ApiRequestError ? e.message : "Попробуйте ещё раз" }),
    });

  if (!unlocked) {
    const hours = referrals?.hours ?? 0;
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-[var(--accent-line-soft)] p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/[0.06] text-muted-foreground">
            <LockIcon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-semibold">Своя приписка к нику</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Пара слов и иконка рядом с именем — в комментариях, карточках и профиле. Открывается с PRO или навсегда, когда твои
              друзья вместе посмотрят 100 часов{hours > 0 ? ` (сейчас — ${hours} ч)` : ""}.
            </p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-primary" style={{ width: `${Math.min(100, hours)}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/profile?tab=invite"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-fuchsia-500 px-3 text-xs font-bold text-white"
          >
            <UserPlusIcon className="size-3.5" />
            Пригласить друзей
          </Link>
          <Link to="/support" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 text-xs font-semibold text-amber-100">
            <CrownIcon className="size-3.5 text-amber-300" />
            Про PRO
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <PenLineIcon className="size-3.5 text-primary" />
          Своя приписка к нику
        </h3>
        <p className="text-xs text-muted-foreground">
          {profile.isPro ? "Открыта с PRO." : "Открыта навсегда — за 100 часов, что посмотрели твои друзья."} До 20 символов, видна всем.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-[var(--accent-line-soft)] bg-background/40 px-3.5 py-3">
        <span className="text-sm font-semibold">{profile.displayName}</span>
        {text.trim() ? <UserTitleBadge prefix={text.trim()} icon={icon} /> : <span className="text-xs text-muted-foreground">— так это будет выглядеть</span>}
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 20))}
        maxLength={20}
        placeholder="Например: «Ночной зритель»"
        className="h-11 w-full rounded-xl border border-[var(--accent-line-soft)] bg-transparent px-3.5 text-sm outline-none transition-colors focus:border-primary/50"
      />

      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {TITLE_ICONS.map((name) => {
          const Icon = TITLE_ICON_COMPONENT[name];
          const on = icon === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              aria-label={name}
              onClick={() => setIcon(on ? null : name)}
              className={cn(
                "grid aspect-square place-items-center rounded-xl border transition-colors",
                on ? "border-primary/60 bg-primary/15 text-primary" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {profile.titlePrefix && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => {
              setText("");
              setIcon(null);
              save({ titlePrefix: null, titleIcon: null }, "Приписка убрана");
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-3 text-xs font-medium"
          >
            <XIcon className="size-3.5" />
            Убрать
          </button>
        )}
        <button
          type="button"
          disabled={!dirty || !text.trim() || update.isPending}
          onClick={() => save({ titlePrefix: text.trim(), titleIcon: icon }, "Приписка сохранена")}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <CheckIcon className="size-3.5" />
          Сохранить
        </button>
      </div>
    </section>
  );
}
