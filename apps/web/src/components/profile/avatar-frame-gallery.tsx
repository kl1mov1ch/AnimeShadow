import type { PublicProfile } from "@animeshadow/shared";
import { SHADOW_AVATAR_FRAMES, cosmeticUnlocked } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  CircleUserRoundIcon,
  GemIcon,
  LockKeyholeIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
  ChevronDownIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { SHADOW_FRAMES, shadowFrame } from "@/lib/avatar-frames";
import {
  frameCosmetic,
  profileCosmeticContext,
  requirementProgress,
  requirementTag,
  requirementText,
} from "@/lib/cosmetics";
import { imageSrc } from "@/lib/format";
import { useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";
import { ShadowAvatarFrame } from "./shadow-avatar-frame";
import "./avatar-frame-gallery.css";

type GalleryProps = { profile: PublicProfile; own?: boolean; className?: string };
const FRAME_COLLECTIONS = [
  { id: "all", name: "Все" },
  { id: "anime", name: "Аниме" },
  { id: "brand", name: "AnimeShadow" },
  { id: "halloween", name: "Хэллоуин" },
  { id: "award", name: "Награды" },
] as const;
type CollectionFilter = (typeof FRAME_COLLECTIONS)[number]["id"];

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
      <DialogContent className="avatar-frame-dialog gap-5 sm:max-w-[1040px]">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>Рамки AnimeShadow</DialogTitle>
          <DialogDescription>
            Соберите свою коллекцию. Примеряйте рамки, узнайте условия и выберите ту,
            что подходит вам.
          </DialogDescription>
        </DialogHeader>
        <AvatarFrameCollection key={profile.id} profile={profile} own={own} />
      </DialogContent>
    </Dialog>
  );
}

/** Also embedded in the profile studio, without creating a nested dialog. */
export function AvatarFrameCollection({
  profile,
  own = false,
  className,
}: GalleryProps) {
  const { user, updateUser } = useAuth();
  const t = useT();
  const client = useQueryClient();
  const update = useUpdateProfile();
  const saved =
    "selectedAvatarFrame" in profile && typeof profile.selectedAvatarFrame === "string"
      ? profile.selectedAvatarFrame
      : profile.avatarFrame;
  const [previewId, setPreviewId] = useState(
    () => shadowFrame(saved)?.id ?? SHADOW_FRAMES[0].id,
  );
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const [search, setSearch] = useState("");
  const [showRequirements, setShowRequirements] = useState(false);
  const reducedMotion = useReducedMotion();
  const selected = shadowFrame(previewId) ?? SHADOW_FRAMES[0];
  const owner = own && user?.id === profile.id;
  const context = profileCosmeticContext(profile);
  const rule = frameCosmetic(selected.id);
  const awardPlace = rule?.weeklyWatch
    ? profile.weeklyWatchAward?.place
    : rule?.monthlyWatch
      ? profile.monthlyWatchAward?.place
      : null;
  const awardFrame = Boolean(rule?.weeklyWatch || rule?.monthlyWatch);
  const previewPlace = awardFrame ? (awardPlace ?? 1) : undefined;
  const progress =
    owner && rule?.watchAnime ? requirementProgress(rule, 1, undefined, context) : null;
  const requirement = rule ? requirementText(rule, t as never) : selected.requirement;
  const available = cosmeticUnlocked(SHADOW_AVATAR_FRAMES, selected.id, context);
  const worn = profile.avatarFrame === selected.id;
  const remembered = saved === selected.id && !worn && !available;
  const collections = FRAME_COLLECTIONS.map((entry) => ({
    ...entry,
    count:
      entry.id === "all"
        ? SHADOW_FRAMES.length
        : SHADOW_FRAMES.filter((frame) => String(frame.category) === entry.id).length,
  })).filter((entry) => entry.count > 0);
  const normalizedSearch = search.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  const entries = SHADOW_FRAMES.map((frame, index) => {
    const cosmetic = frameCosmetic(frame.id)!;
    const unlocked = cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame.id, context);
    const goal = cosmetic.watchAnime?.requiredEpisodes ?? 0;
    const watched = cosmetic.watchAnime
      ? (context.animeQualifiedEpisodes?.[cosmetic.watchAnime.animeId] ?? 0)
      : 0;
    return { frame, index, cosmetic, unlocked, goal, watched };
  });
  const visibleFrames = entries
    .filter(
      ({ frame, cosmetic }) =>
        (collection === "all" || frame.category === collection) &&
        (!normalizedSearch ||
          `${frame.name} ${"name" in cosmetic ? cosmetic.name : ""}`
            .toLocaleLowerCase("ru")
            .replaceAll("ё", "е")
            .includes(normalizedSearch)),
    )
    .sort((a, b) => b.index - a.index);
  const opened = entries.filter((entry) => entry.unlocked).length;
  const filtered = search !== "" || collection !== "all";
  function resetFilters() {
    setSearch("");
    setCollection("all");
  }

  function save(frame: string | null) {
    if (!owner || update.isPending) return;
    if (frame && !cosmeticUnlocked(SHADOW_AVATAR_FRAMES, frame, context)) return;
    update.mutate(
      { avatarFrame: frame },
      {
        onSuccess: (data) => {
          updateUser({ avatarFrame: data.avatarFrame });
          if (data.username)
            void client.invalidateQueries({ queryKey: ["profile", data.username] });
          void client.invalidateQueries({ queryKey: ["profile", "by-id", data.id] });
          toast.success(frame ? "Рамка надета" : "Рамка снята");
        },
        onError: (error) =>
          toast.error(
            error.message || "Не удалось сохранить рамку. Попробуйте ещё раз.",
          ),
      },
    );
  }

  return (
    <section
      className={cn("avatar-frame-collection", className)}
      aria-label="Коллекция рамок аватара"
      style={{ "--avatar-frame-accent": selected.accent } as CSSProperties}
    >
      <div className="avatar-frame-collection__layout">
        <aside
          className="avatar-frame-collection__preview"
          aria-label="Примерка и условия рамки"
        >
          <div className="avatar-frame-collection__preview-heading">
            <span className="avatar-frame-collection__eyebrow">Примерочная</span>
            <Toggle
              size="sm"
              pressed={motionEnabled && !reducedMotion}
              onPressedChange={setMotionEnabled}
              disabled={reducedMotion}
              aria-label="Анимация рамки"
              title={
                reducedMotion
                  ? "Движение отключено в настройках устройства"
                  : "Включить или остановить анимацию"
              }
            >
              {motionEnabled && !reducedMotion ? <PauseIcon /> : <PlayIcon />}{" "}
              {reducedMotion ? "Без движения" : "Анимация"}
            </Toggle>
          </div>
          <div className="avatar-frame-collection__portrait">
            <ShadowAvatarFrame
              frame={selected.id}
              animated={motionEnabled && !reducedMotion}
              size={128}
              place={previewPlace}
            >
              <ProfileFace profile={profile} size={128} />
            </ShadowAvatarFrame>
          </div>
          <div className="avatar-frame-collection__identity">
            <span className="truncate text-sm font-semibold">
              {profile.displayName}
            </span>
            {awardFrame && (
              <span className="text-xs text-muted-foreground">
                {awardPlace ? `Лучшее место: №${awardPlace}` : "Примерка · показано №1"}
              </span>
            )}
          </div>
          <div
            className="avatar-frame-collection__story"
            aria-live="polite"
            aria-atomic="true"
          >
            <Badge variant="outline">
              {owner && available ? <CheckIcon /> : rule?.pro ? <GemIcon /> : null}
              {owner && available
                ? "Открыта"
                : rule
                  ? (requirementTag(rule) ?? selected.requirement)
                  : selected.requirement}
            </Badge>
            <h3 className="font-display text-lg leading-snug">{selected.name}</h3>
            <p>{selected.description}</p>
          </div>
          <button
            type="button"
            className="avatar-frame-collection__mobile-explain"
            aria-expanded={showRequirements}
            onClick={() => setShowRequirements((value) => !value)}
          >
            Условия получения <ChevronDownIcon aria-hidden />
          </button>
          <div
            className="avatar-frame-collection__requirement"
            data-expanded={showRequirements}
          >
            <span className="avatar-frame-collection__eyebrow">Как получить</span>
            {rule?.watchAnime ? (
              <>
                <strong>{requirement}</strong>
                <p>
                  Смотрите в плеере AnimeShadow — прогресс засчитается автоматически.
                </p>
                {rule.watchAnime.episodesTotal > 24 && (
                  <p>
                    Для длинного тайтла достаточно {rule.watchAnime.requiredEpisodes}{" "}
                    зачётов.
                  </p>
                )}
                {progress && (
                  <div className="avatar-frame-collection__progress">
                    <span>
                      {progress.target === 1
                        ? progress.current
                          ? "Фильм засчитан"
                          : "Фильм ещё не засчитан"
                        : `Засчитано ${progress.current} из ${progress.target}`}
                    </span>
                    <progress
                      max={progress.target}
                      value={progress.current}
                      aria-label={`Зачёты просмотра: ${progress.current} из ${progress.target}`}
                    />
                    <span className="avatar-frame-collection__credits" aria-hidden>
                      {Array.from({ length: progress.target }, (_, i) => (
                        <span key={i} data-earned={i < progress.current}>
                          {i < progress.current ? "+" : "·"}
                        </span>
                      ))}
                    </span>
                    <span>
                      {progress.current >= progress.target
                        ? "Цель достигнута — рамка открыта"
                        : "Смотрите дальше — следующий зачёт появится автоматически"}
                    </span>
                  </div>
                )}
                <details className="avatar-frame-collection__rules">
                  <summary>Как засчитывается просмотр</summary>
                  <p>
                    Плюс за серию появляется после подтверждённого просмотра половины её
                    длительности. Для фильма действует такой же принцип — один зачёт за
                    просмотр. Пауза, перемотка, ручные отметки и параллельные вкладки не
                    ускоряют открытие. Повтор одной серии не даёт второй плюс.
                  </p>
                  <p>
                    Новый точный учёт начинается после обновления: старые отметки серий
                    не превращаются в часы.
                  </p>
                </details>
              </>
            ) : (
              <p>
                {rule?.pro
                  ? "Активируйте PRO. Пробная подписка тоже открывает эту рамку; после окончания подписки выбор сохранится."
                  : rule?.requires === "early-adopter"
                    ? "Зарегистрируйтесь до 1 марта 2027 года. Памятная рамка остаётся навсегда."
                    : requirement}
              </p>
            )}
          </div>
          <div className="avatar-frame-collection__actions">
            {owner ? (
              <>
                {remembered && (
                  <p>
                    Ваш выбор сохранён. Рамка вернётся, когда снова станет доступна.
                  </p>
                )}
                <Button
                  type="button"
                  disabled={!available || worn || update.isPending}
                  onClick={() => save(selected.id)}
                >
                  {update.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : worn ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : !available ? (
                    <LockKeyholeIcon data-icon="inline-start" />
                  ) : null}
                  {worn
                    ? "Сейчас надета"
                    : available
                      ? "Надеть рамку"
                      : "Нужно открыть"}
                </Button>
                {!available && rule?.watchAnime && (
                  <Button variant="outline" asChild>
                    <Link to={`/anime/${rule.watchAnime.animeId}`}>
                      Смотреть этот тайтл
                    </Link>
                  </Button>
                )}
                {!available && rule?.pro && (
                  <Button variant="outline" asChild>
                    <Link to="/support">Открыть PRO</Link>
                  </Button>
                )}
                {!available && awardFrame && (
                  <Button variant="outline" asChild>
                    <Link
                      to={
                        rule?.monthlyWatch
                          ? "/leaderboards?period=month"
                          : "/leaderboards"
                      }
                    >
                      К рейтингу зрителей
                    </Link>
                  </Button>
                )}
                {saved != null && saved !== "none" && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={() => save(null)}
                  >
                    Снять рамку
                  </Button>
                )}
                <p>
                  Примерка не меняет профиль. Изменения сохранятся по кнопке «Надеть
                  рамку».
                </p>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link to={user ? "/profile?studio=look" : "/register"}>
                    {user ? "К моим рамкам" : "Создать профиль"}
                  </Link>
                </Button>
                <p>Все рамки можно примерить. Сохранить выбор можно в своём профиле.</p>
              </>
            )}
          </div>
        </aside>
        <div className="avatar-frame-collection__details">
          <div className="avatar-frame-collection__catalog-title">
            <div>
              <span className="avatar-frame-collection__eyebrow">
                Коллекция AnimeShadow
              </span>
              <h3>Найдите свою рамку</h3>
            </div>
            <span>
              {owner
                ? `${opened} / ${SHADOW_FRAMES.length} открыто`
                : `${SHADOW_FRAMES.length} рамки`}
            </span>
          </div>
          <div className="avatar-frame-collection__browser">
            <div className="avatar-frame-collection__search">
              <SearchIcon aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название рамки или аниме"
                aria-label="Поиск рамок"
              />
            </div>
            <ToggleGroup
              type="single"
              value={collection}
              onValueChange={(value) => {
                const next = FRAME_COLLECTIONS.find((entry) => entry.id === value);
                if (next) setCollection(next.id);
              }}
              spacing={1}
              size="sm"
              aria-label="Коллекция рамок"
              className="avatar-frame-collection__filters"
            >
              {collections.map((entry) => (
                <ToggleGroupItem key={entry.id} value={entry.id}>
                  <span>{entry.name}</span>
                  <span>{entry.count}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="avatar-frame-collection__results" aria-live="polite">
              <span>
                <SlidersHorizontalIcon aria-hidden /> Найдено {visibleFrames.length} из{" "}
                {SHADOW_FRAMES.length}
              </span>
              {filtered && (
                <button type="button" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              )}
            </div>
            {visibleFrames.length ? (
              <ToggleGroup
                type="single"
                value={selected.id}
                onValueChange={(value) => {
                  const frame = shadowFrame(value);
                  if (frame) setPreviewId(frame.id);
                }}
                spacing={2}
                variant="outline"
                aria-label="Примерить рамку"
                className="avatar-frame-collection__options"
              >
                {visibleFrames.map(({ frame, cosmetic, unlocked, goal, watched }) => (
                  <ToggleGroupItem
                    value={frame.id}
                    key={frame.id}
                    aria-label={`Примерить: ${frame.name}`}
                    title={frame.name}
                    className="avatar-frame-collection__option"
                  >
                    <span className="avatar-frame-collection__card-art">
                      <ShadowAvatarFrame
                        frame={frame.id}
                        size={48}
                        place={
                          frame.id === "shadow-weekly"
                            ? (profile.weeklyWatchAward?.place ?? 1)
                            : frame.id === "shadow-monthly"
                              ? (profile.monthlyWatchAward?.place ?? 1)
                              : undefined
                        }
                      >
                        <ProfileFace profile={profile} size={48} />
                      </ShadowAvatarFrame>
                    </span>
                    <span className="avatar-frame-collection__option-name">
                      {frame.name}
                    </span>
                    <span className="avatar-frame-collection__option-state">
                      {profile.avatarFrame === frame.id ? (
                        <>
                          <CheckIcon /> Надета
                        </>
                      ) : owner && unlocked ? (
                        <>
                          <CheckIcon /> Открыта
                        </>
                      ) : (
                        <>
                          {owner && <LockKeyholeIcon />}
                          {requirementTag(cosmetic) ??
                            (cosmetic.requires ? "Ранний участник" : "Доступна всем")}
                        </>
                      )}
                    </span>
                    {owner && goal > 0 && (
                      <span
                        className="avatar-frame-collection__card-progress"
                        aria-hidden
                      >
                        <span
                          style={{ width: `${Math.min(100, (watched / goal) * 100)}%` }}
                        />
                      </span>
                    )}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <div className="avatar-frame-collection__empty">
                <SearchIcon />
                <strong>Рамки не найдены</strong>
                <p>Попробуйте другое название или снимите часть фильтров.</p>
                <Button variant="outline" onClick={resetFilters}>
                  Показать всю коллекцию
                </Button>
              </div>
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
      {profile.avatarUrl && (
        <AvatarImage src={imageSrc(profile.avatarUrl, 360)} alt="" />
      )}
      <AvatarFallback className={size >= 100 ? "font-display text-3xl" : undefined}>
        {(profile.displayName || "?").charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  return reduced;
}
