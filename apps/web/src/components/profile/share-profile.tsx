import type { PublicProfile } from "@animeshadow/shared";
import { AtSignIcon, Share2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { QrShareCard } from "@/components/common/qr-share";
import { HoloAchievementBadge } from "@/components/holo-achievement-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { imageSrc } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { levelOf } from "./profile-level";
import { LevelBadge } from "./level-visuals";

/**
 * "Show off my profile": a card with the level, the headline numbers and the
 * pinned achievements over a QR code to the profile — shared to the phone's
 * share sheet (the code as a picture), Telegram, as a link or saved.
 * A profile is addressed by its nickname, so without one the button offers
 * to take one first.
 */
export function ShareProfileButton({
  profile,
  own,
  onNeedUsername,
  className,
}: {
  profile: PublicProfile;
  own: boolean;
  /** Own profile without a nickname: where to go to take one. */
  onNeedUsername?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const info = useMemo(() => levelOf(profile), [profile]);
  const url = profile.username ? `${SITE_URL}/profile/${profile.username}` : null;
  const pinned = profile.showcaseAchievementIds
    .map((id) => profile.achievements.find((a) => a.id === id && a.earned))
    .filter((a) => a != null)
    .slice(0, 5);
  const numbers = [
    { value: profile.stats.episodesWatched.toLocaleString("ru-RU"), label: "серий" },
    { value: profile.stats.titlesCompleted.toLocaleString("ru-RU"), label: "тайтлов" },
    { value: profile.achievements.filter((a) => a.earned).length.toLocaleString("ru-RU"), label: "достижений" },
  ];

  const button = (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/15 bg-black/35 px-3.5 text-sm font-medium text-foreground transition-[border-color,background-color,transform] duration-200 hover:border-white/30 hover:bg-black/50 active:scale-95",
        className,
      )}
    >
      <Share2Icon className="size-4" />
      <span>Поделиться</span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{button}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-sm">
        {open &&
          (url ? (
            <QrShareCard
              url={url}
              title={profile.displayName}
              description={`${info.level} уровень · ${info.tier.name}`}
              image={profile.avatarUrl ? imageSrc(profile.avatarUrl) : undefined}
              imageShape="avatar"
              filename={`animeshadow-${profile.username}`}
              shareText={
                own
                  ? `Мой профиль на AnimeShadow — ${info.level} уровень, ${profile.stats.episodesWatched} серий`
                  : `Профиль ${profile.displayName} на AnimeShadow`
              }
            >
              <div className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-background/50 p-3">
                <LevelBadge info={info} size={48} />
                <div className="grid flex-1 grid-cols-3 gap-1 text-center">
                  {numbers.map((n) => (
                    <div key={n.label} className="min-w-0">
                      <p className="truncate font-display text-base leading-tight tabular-nums">{n.value}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{n.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {pinned.length > 0 && (
                <div className="-mt-1 flex justify-center gap-1.5">
                  {pinned.map((a) => (
                    <HoloAchievementBadge key={a.id} id={a.id} rarity={a.rarity} earned earnedAt={a.earnedAt} variant="circle" tip={false} className="size-8" />
                  ))}
                </div>
              )}
            </QrShareCard>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
                <AtSignIcon className="size-6" />
              </span>
              <DialogTitle className="font-display text-lg">Сначала займите никнейм</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {own
                  ? "Ссылка на профиль строится по нику: animeshadow…/profile/ваш_ник. Займите его — и делитесь."
                  : "У этого профиля пока нет ника, поэтому и ссылки на него нет."}
              </DialogDescription>
              {own && onNeedUsername && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onNeedUsername();
                  }}
                  className="mt-1 h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  Выбрать ник
                </button>
              )}
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}
