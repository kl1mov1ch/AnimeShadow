import type { PublicProfile } from "@animeshadow/shared";
import { SHADOW_AVATAR_FRAMES, cosmeticUnlocked } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleUserRoundIcon, GemIcon, LockKeyholeIcon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { SHADOW_FRAMES, shadowFrame } from "@/lib/avatar-frames";
import { imageSrc } from "@/lib/format";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { ShadowAvatarFrame } from "./shadow-avatar-frame";
import "./avatar-frame-gallery.css";

type GalleryProps = { profile: PublicProfile; own?: boolean; className?: string };
type CollectionFilter = "all" | "anime" | "brand";
const BRAND_FRAME_IDS = new Set<string>(["shadow-standard", "shadow-pro", "shadow-founder"]);

/** Public discovery and local preview; opening this never changes a profile. */
export function AvatarFrameGallery({ profile, own = false, className }: GalleryProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className}>
          <CircleUserRoundIcon data-icon="inline-start" />
          Рамки аватара
        </Button>
      </DialogTrigger>
      <DialogContent className="avatar-frame-dialog gap-5 sm:max-w-[760px]">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Рамки AnimeShadow</DialogTitle>
          <DialogDescription>Примерьте любую рамку. Ваш выбор сохранится только после нажатия «Надеть».</DialogDescription>
        </DialogHeader>
        <AvatarFrameCollection key={profile.id} profile={profile} own={own} />
      </DialogContent>
    </Dialog>
  );
}

/** Also embedded in the profile studio, without creating a nested dialog. */
export function AvatarFrameCollection({ profile, own = false, className }: GalleryProps) {
  const { user, updateUser } = useAuth();
  const client = useQueryClient();
  const update = useUpdateProfile();
  const saved = "selectedAvatarFrame" in profile && typeof profile.selectedAvatarFrame === "string"
    ? profile.selectedAvatarFrame : profile.avatarFrame;
  const [previewId, setPreviewId] = useState(() => shadowFrame(saved)?.id ?? SHADOW_FRAMES[0].id);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const reducedMotion = useReducedMotion();
  const selected = shadowFrame(previewId) ?? SHADOW_FRAMES[0];
  const owner = own && user?.id === profile.id;
  const context = {
    earnedIds: profile.achievements.filter((achievement) => achievement.earned).map((achievement) => achievement.id),
    level: 1,
    pro: profile.isPro,
    memberSince: profile.memberSince,
  };
  const available = cosmeticUnlocked(SHADOW_AVATAR_FRAMES, selected.id, context);
  const worn = profile.avatarFrame === selected.id;
  const remembered = saved === selected.id && !worn && !available;
  const animeCount = SHADOW_FRAMES.filter((frame) => !BRAND_FRAME_IDS.has(frame.id)).length;
  const visibleFrames = SHADOW_FRAMES.filter((frame) => collection === "all"
    || (collection === "brand" ? BRAND_FRAME_IDS.has(frame.id) : !BRAND_FRAME_IDS.has(frame.id)));

  function save(frame: string | null) {
    if (!owner || update.isPending) return;
    if (frame && !cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame, context)) return;
    update.mutate({ avatarFrame: frame }, {
      onSuccess: (data) => {
        updateUser({ avatarFrame: data.avatarFrame });
        if (data.username) void client.invalidateQueries({ queryKey: ["profile", data.username] });
        void client.invalidateQueries({ queryKey: ["profile", "by-id", data.id] });
        toast.success(frame ? "Рамка надета" : "Рамка снята");
      },
      onError: (error) => toast.error(error.message || "Не удалось сохранить рамку. Попробуйте ещё раз."),
    });
  }

  return (
    <section
      className={cn("avatar-frame-collection", className)}
      aria-label="Коллекция рамок аватара"
      style={{ "--avatar-frame-accent": selected.accent } as CSSProperties}
    >
      <div className="avatar-frame-collection__layout">
        <div className="avatar-frame-collection__preview">
          <div className="avatar-frame-collection__portrait">
            <ShadowAvatarFrame frame={selected.id} animated={motionEnabled && !reducedMotion} size={144}>
              <ProfileFace profile={profile} size={144} />
            </ShadowAvatarFrame>
          </div>
          <div className="avatar-frame-collection__identity">
            <span className="truncate text-sm font-semibold">{profile.displayName}</span>
            <span className="text-xs text-muted-foreground">Предпросмотр на аватаре</span>
          </div>
          <Toggle
            size="sm"
            pressed={motionEnabled && !reducedMotion}
            onPressedChange={setMotionEnabled}
            disabled={reducedMotion}
            aria-label="Анимация рамки"
            title={reducedMotion ? "Движение отключено в настройках устройства" : "Включить или остановить анимацию"}
            className="mt-3 gap-1.5 px-2"
          >
            {motionEnabled && !reducedMotion ? <PauseIcon /> : <PlayIcon />}
            {reducedMotion ? "Без анимации" : "Анимация"}
          </Toggle>
        </div>

        <div className="avatar-frame-collection__details">
          <div className="flex flex-col items-start gap-2.5" aria-live="polite" aria-atomic="true">
            <Badge variant="outline">
              {owner && available ? <CheckIcon /> : "pro" in selected && selected.pro ? <GemIcon /> : null}
              {owner && available ? "Доступна вам" : selected.requirement}
            </Badge>
            <h3 className="font-display text-lg leading-snug">{selected.name}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{selected.description}</p>
          </div>

          <div className="avatar-frame-collection__browser">
            {animeCount > 0 && (
              <ToggleGroup
                type="single"
                value={collection}
                onValueChange={(value) => { if (value === "all" || value === "anime" || value === "brand") setCollection(value); }}
                spacing={1}
                size="sm"
                aria-label="Коллекция рамок"
                className="avatar-frame-collection__filters"
              >
                <ToggleGroupItem value="all">Все <span className="text-muted-foreground">{SHADOW_FRAMES.length}</span></ToggleGroupItem>
                <ToggleGroupItem value="anime">Аниме <span className="text-muted-foreground">{animeCount}</span></ToggleGroupItem>
                <ToggleGroupItem value="brand">AnimeShadow</ToggleGroupItem>
              </ToggleGroup>
            )}
            <ToggleGroup
              key={collection}
              type="single"
              value={selected.id}
              onValueChange={(value) => { const frame = shadowFrame(value); if (frame) setPreviewId(frame.id); }}
              spacing={2}
              variant="outline"
              aria-label="Примерить рамку"
              className="avatar-frame-collection__options"
            >
              {visibleFrames.map((frame) => (
                <ToggleGroupItem value={frame.id} key={frame.id} aria-label={`Примерить: ${frame.name}`} className="avatar-frame-collection__option">
                  <ShadowAvatarFrame frame={frame.id} size={36}>
                    <ProfileFace profile={profile} size={36} />
                  </ShadowAvatarFrame>
                  <span className="avatar-frame-collection__option-name">{frame.name}</span>
                  <span className="avatar-frame-collection__option-state">
                    {profile.avatarFrame === frame.id ? <><CheckIcon /> Надета</> : owner && !cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, context) ? <><LockKeyholeIcon /> {"pro" in frame && frame.pro ? "PRO" : "За достижение"}</> : "Примерить"}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="avatar-frame-collection__actions">
            {owner ? (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {remembered
                    ? "Ваш выбор сохранён. Рамка вернётся, когда снова станет доступна."
                    : available
                      ? "Примерка не меняет профиль. Сохраните понравившуюся рамку."
                      : selected.id === "shadow-pro"
                        ? "Рамка доступна с активным PRO, в том числе во время пробного периода."
                        : "Для аккаунтов, созданных до 1 марта 2027 года. Можно примерить, даже если достижение ещё не открыто."}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" disabled={!available || worn || update.isPending} onClick={() => save(selected.id)}>
                    {update.isPending ? <Spinner data-icon="inline-start" /> : worn ? <CheckIcon data-icon="inline-start" /> : !available ? <LockKeyholeIcon data-icon="inline-start" /> : null}
                    {worn ? "Надета" : available ? "Надеть рамку" : "Пока недоступна"}
                  </Button>
                  {!available && selected.id === "shadow-pro" && <Button variant="outline" asChild><Link to="/support">Открыть PRO</Link></Button>}
                  {saved != null && saved !== "none" && (
                    <Button type="button" variant="ghost" disabled={update.isPending} onClick={() => save(null)}>Снять рамку</Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-muted-foreground">Все рамки можно рассмотреть и примерить. Надеть рамку можно в своём профиле.</p>
                <Button asChild>
                  <Link to={user ? "/profile?studio=look" : "/register"}>{user ? "К моим рамкам" : "Создать профиль"}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileFace({ profile, size }: { profile: PublicProfile; size: number }) {
  return (
    <Avatar style={{ width: size, height: size }}>
      {profile.avatarUrl && <AvatarImage src={imageSrc(profile.avatarUrl, 360)} alt="" />}
      <AvatarFallback className={size >= 100 ? "font-display text-3xl" : undefined}>
        {(profile.displayName || "?").charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  return reduced;
}
