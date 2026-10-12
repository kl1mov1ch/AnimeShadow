import { useQueryClient } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LevelBadge } from "@/components/profile/level-visuals";
import { earnedSources, levelOf, MAX_LEVEL, tierFor, xpForLevel } from "@/components/profile/profile-level";
import { useAdminSetUser, usePublicProfileById } from "@/lib/query";

/**
 * Sets an account's profile level: the level is the account's own
 * experience plus a bonus only admins set, so "give level N" sets the bonus
 * to whatever is missing for N. Zero takes the bonus off — back to the
 * level the account earned. Activity keeps adding on top either way.
 */
export function AdminLevelGrant({ userId }: { userId: string }) {
  const client = useQueryClient();
  const { data: profile, isPending } = usePublicProfileById(userId);
  const update = useAdminSetUser();
  const [target, setTarget] = useState("");

  if (isPending || !profile) return <div className="h-24 animate-pulse rounded-2xl bg-foreground/[0.05]" />;

  const info = levelOf(profile);
  const earned = earnedSources(profile).reduce((sum, s) => sum + s.xp, 0);
  const wanted = Math.round(Number(target));
  const valid = Number.isFinite(wanted) && wanted >= 1 && wanted <= MAX_LEVEL;
  const preview = valid ? tierFor(wanted) : null;

  const apply = (bonusXp: number) =>
    update.mutate(
      { id: userId, input: { bonusXp } },
      {
        onSuccess: () => {
          toast.success(bonusXp > 0 ? "Уровень выдан" : "Бонусный опыт снят");
          setTarget("");
          void client.invalidateQueries({ queryKey: ["profile"] });
          void client.invalidateQueries({ queryKey: ["me"] });
        },
        onError: () => toast.error("Не удалось сохранить"),
      },
    );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/40 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <SparklesIcon className="size-4 text-primary" />
        Уровень профиля
      </h3>
      <div className="flex items-center gap-3">
        <LevelBadge info={info} size={52} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            {info.level} ур. · <span style={{ color: info.tier.colors[0] }}>{info.tier.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Своего опыта {earned.toLocaleString("ru-RU")}
            {profile.bonusXp > 0 && ` · бонус ${profile.bonusXp.toLocaleString("ru-RU")}`}
          </p>
        </div>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) apply(Math.max(0, xpForLevel(wanted) - earned));
        }}
      >
        <input
          type="number"
          min={1}
          max={MAX_LEVEL}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={`Уровень, 1–${MAX_LEVEL}`}
          className="h-9 w-40 rounded-lg border border-border/70 bg-background/60 px-3 text-sm outline-none focus:border-foreground/30"
        />
        <button
          type="submit"
          disabled={!valid || update.isPending}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Выдать
        </button>
        {profile.bonusXp > 0 && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => apply(0)}
            className="h-9 rounded-lg border border-border/70 px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Снять бонус
          </button>
        )}
        {preview && <span className="text-xs text-muted-foreground">→ «{preview.name}»</span>}
      </form>
    </section>
  );
}
