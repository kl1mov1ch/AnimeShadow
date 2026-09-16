import type { Character, CharacterDetail } from "@animeshadow/shared";
import {
  BookMarkedIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoffeeIcon,
  EyeIcon,
  FilmIcon,
  HeartIcon,
  type LucideIcon,
  MicIcon,
  ShirtIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useCharacterDetail } from "@/lib/query";
import { cn } from "@/lib/utils";

type AppearanceItem = CharacterDetail["animes"][number];
type SeiyuItem = CharacterDetail["seiyu"][number];

/**
 * Full character profile: the photos on the left (a gallery when there's more
 * than one), everything known about them on the right — names, stats,
 * spoiler trivia (hidden until asked for) and the bio split into its own
 * titled sections. The list data the card already has renders instantly; the
 * detail fills in once fetched.
 */
export function CharacterModal({
  character,
  onOpenChange,
}: {
  character: Character | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, isError } = useCharacterDetail(character?.id ?? null);

  return (
    <Dialog open={character != null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl md:h-[min(88vh,760px)] md:flex-row">
        {character && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{character.name}</DialogTitle>
              <DialogDescription>{character.role}</DialogDescription>
            </DialogHeader>

            <CharacterGallery key={character.id} character={character} data={data} />

            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
              <CharacterInfo
                key={character.id}
                character={character}
                data={data}
                isPending={isPending}
                isError={isError}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CharacterGallery({
  character,
  data,
}: {
  character: Character;
  data: CharacterDetail | undefined;
}) {
  const t = useT();
  const images =
    data && data.images.length > 0
      ? data.images
      : [data?.imageLargeUrl ?? character.imageUrl].filter((url): url is string => Boolean(url));
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(images.length - 1, 0));
  const current = images[safeIndex];
  const step = (dir: 1 | -1) => setIndex((safeIndex + dir + images.length) % images.length);

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-muted/40 p-3 md:w-[42%] md:border-b-0 md:border-r md:p-4">
      <div className="relative h-72 overflow-hidden rounded-xl border border-border/60 bg-muted sm:h-96 md:h-auto md:min-h-0 md:flex-1">
        {current ? (
          <>
            <img
              aria-hidden
              src={imageSrc(current)}
              alt=""
              className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
            />
            <img
              key={current}
              src={imageSrc(current)}
              alt={character.name}
              className="relative size-full object-contain animate-in fade-in duration-300"
            />
          </>
        ) : (
          <PosterFallback title={character.name} seed={character.id} variant="avatar" />
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("common.previous")}
              className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/70 text-foreground shadow backdrop-blur transition-colors hover:bg-background"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("common.next")}
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/70 text-foreground shadow backdrop-blur transition-colors hover:bg-background"
            >
              <ChevronRightIcon className="size-5" />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
              {safeIndex + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}`}
              aria-current={i === safeIndex}
              className={cn(
                "h-16 w-12 shrink-0 overflow-hidden rounded-md border-2 transition",
                i === safeIndex ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <img src={imageSrc(src)} alt="" loading="lazy" className="size-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTION_ICONS: Array<[RegExp, LucideIcon]> = [
  [/внешн|appear|look/i, ShirtIcon],
  [/истор|биограф|прошл|history|background|past/i, BookOpenIcon],
  [/характер|личност|personal/i, HeartIcon],
  [/способн|сил|навык|abilit|power|skill/i, ZapIcon],
  [/привыч|увлеч|хобби|habit|hobb/i, CoffeeIcon],
];

function sectionIcon(title: string): LucideIcon {
  return SECTION_ICONS.find(([pattern]) => pattern.test(title))?.[1] ?? SparklesIcon;
}

function StatTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** Present when there's more detail behind this stat — opens it in its own modal. */
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 text-left",
        onClick && "transition-colors hover:border-primary/40 hover:bg-primary/[0.06]",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
      {onClick && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />}
    </Tag>
  );
}

/** A scrollable list of anime/manga the character appears in — clicking the
 * count tile is more useful than a bare number once there's real data
 * behind it. Anime rows link to the title's own page; manga rows are
 * informational only, since this site doesn't have manga pages. */
function AppearancesModal({
  kind,
  items,
  title,
  open,
  onOpenChange,
}: {
  kind: "anime" | "manga";
  items: AppearanceItem[];
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* w-[calc(100%-2rem)] rather than the base component's implicit
          full-width-until-sm: without an explicit min-w-0 down through every
          row, a long unbroken title could force the dialog wider than the
          viewport instead of just wrapping — overflow-hidden is the backstop,
          min-w-0 + break-words on the text itself is the actual fix. */}
      <DialogContent className="flex w-[calc(100%-2rem)] max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {items.map((item) => {
            const inner = (
              <>
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.imageUrl ? (
                    <img
                      src={imageSrc(item.imageUrl)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <PosterFallback title={item.title} seed={item.id} variant="avatar" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm font-medium leading-snug">
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[item.kind, item.year].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </>
            );
            const rowClass =
              "flex min-w-0 items-center gap-3 rounded-lg p-2 transition-colors hover:bg-primary/[0.06]";
            return kind === "anime" ? (
              <Link key={item.id} to={`/anime/${item.id}`} className={rowClass}>
                {inner}
              </Link>
            ) : (
              <div key={item.id} className={rowClass}>
                {inner}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Full voice-cast detail — the inline tile only has room for the lead JP
 * seiyu's name; this shows every credited actor with a real-size photo. */
function VoiceActorsModal({
  actors,
  title,
  open,
  onOpenChange,
}: {
  actors: SeiyuItem[];
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[calc(100%-2rem)] max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {actors.map((actor, i) => (
            <div key={`${actor.name}-${i}`} className="flex min-w-0 items-center gap-3 rounded-lg p-2">
              <div className="size-14 shrink-0 overflow-hidden rounded-full bg-muted">
                {actor.imageUrl ? (
                  <img
                    src={imageSrc(actor.imageUrl)}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <PosterFallback title={actor.name} seed={i} variant="avatar" />
                )}
              </div>
              <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">
                {actor.name}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CharacterInfo({
  character,
  data,
  isPending,
  isError,
}: {
  character: Character;
  data: CharacterDetail | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const [appearancesOpen, setAppearancesOpen] = useState<"anime" | "manga" | null>(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const isMain = character.role.toLowerCase() === "main";
  const voice = character.voiceActor ?? data?.seiyu[0] ?? null;
  // The inline tile shows one name; the modal behind it should show every
  // credited actor Shikimori knows, falling back to the single voiceActor
  // the character list itself already had if the detail fetch found none.
  const voiceActors: SeiyuItem[] =
    data && data.seiyu.length > 0
      ? data.seiyu
      : character.voiceActor
        ? [{ name: character.voiceActor.name, imageUrl: character.voiceActor.imageUrl }]
        : [];
  const subtitle = [data?.originalName, data?.japaneseName].filter(Boolean).join(" · ");
  const hasText =
    Boolean(data?.description) || (data?.sections.length ?? 0) > 0 || (data?.facts.length ?? 0) > 0;
  const displayName = data?.name ?? character.name;

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <header className="flex flex-col gap-2 pr-8">
        <span
          className={cn(
            "w-fit rounded-full px-2.5 py-0.5 text-xs font-medium",
            isMain ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
          )}
        >
          {isMain ? t("detail.mainRole") : character.role}
        </span>
        <h2 className="font-display text-2xl leading-tight sm:text-3xl">{data?.name ?? character.name}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {data && data.aliases.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground">{t("detail.characterModal.aliases")}</span>
            {data.aliases.map((alias) => (
              <span
                key={alias}
                className="rounded-md border border-border/60 bg-card/60 px-2 py-0.5 text-xs"
              >
                {alias}
              </span>
            ))}
          </div>
        )}
      </header>

      {(voice || data?.animeCount || data?.mangaCount) && (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {voice && (
            <StatTile
              icon={
                voice.imageUrl ? (
                  <img src={imageSrc(voice.imageUrl)} alt="" className="size-8 rounded-lg object-cover" />
                ) : (
                  <MicIcon />
                )
              }
              label={t("detail.characterModal.voicedBy")}
              value={voice.name}
              onClick={voiceActors.length > 0 ? () => setVoiceModalOpen(true) : undefined}
            />
          )}
          {data?.animeCount ? (
            <StatTile
              icon={<FilmIcon />}
              label={t("detail.characterModal.appearsInAnime")}
              value={data.animeCount}
              onClick={data.animes.length > 0 ? () => setAppearancesOpen("anime") : undefined}
            />
          ) : null}
          {data?.mangaCount ? (
            <StatTile
              icon={<BookMarkedIcon />}
              label={t("detail.characterModal.appearsInManga")}
              value={data.mangaCount}
              onClick={data.mangas.length > 0 ? () => setAppearancesOpen("manga") : undefined}
            />
          ) : null}
        </div>
      )}

      <AppearancesModal
        kind="anime"
        items={data?.animes ?? []}
        title={t("detail.characterModal.animeAppearancesTitle", { name: displayName })}
        open={appearancesOpen === "anime"}
        onOpenChange={(open) => setAppearancesOpen(open ? "anime" : null)}
      />
      <AppearancesModal
        kind="manga"
        items={data?.mangas ?? []}
        title={t("detail.characterModal.mangaAppearancesTitle", { name: displayName })}
        open={appearancesOpen === "manga"}
        onOpenChange={(open) => setAppearancesOpen(open ? "manga" : null)}
      />
      <VoiceActorsModal
        actors={voiceActors}
        title={t("detail.characterModal.voiceActorsTitle", { name: displayName })}
        open={voiceModalOpen}
        onOpenChange={setVoiceModalOpen}
      />

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">{t("detail.characterModal.loadError")}</p>
      ) : !hasText ? (
        <p className="text-sm text-muted-foreground">{t("detail.characterModal.noDescription")}</p>
      ) : (
        <>
          {data && data.facts.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <SparklesIcon className="size-4 text-primary" />
                {t("detail.characterModal.facts")}
              </h3>
              <div className="relative">
                <ol
                  aria-hidden={!revealed}
                  className={cn(
                    "flex flex-col gap-2 transition-[filter] duration-300",
                    !revealed && "pointer-events-none select-none blur-sm",
                  )}
                >
                  {data.facts.map((fact, i) => (
                    <li
                      key={i}
                      className="flex gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3 text-sm leading-relaxed"
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span className="text-foreground/90">{fact}</span>
                    </li>
                  ))}
                </ol>
                {!revealed && (
                  // Sticky, not just centered in the (possibly very tall)
                  // blurred list: with more than a couple of facts, a plain
                  // "centered in the block" button ends up parked well below
                  // the fold, so scrolling through the modal never actually
                  // shows it. Sticky-to-the-viewport-midpoint keeps it in
                  // view the moment this section scrolls into range. The
                  // wrapper is zero-height so it doesn't add scroll space of
                  // its own; the translate centers the button on that point.
                  <div className="pointer-events-none sticky top-1/2 z-10 flex h-0 justify-center">
                    <button
                      type="button"
                      onClick={() => setRevealed(true)}
                      className="pointer-events-auto inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-border/60 bg-background/90 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      <EyeIcon className="size-4" />
                      {t("detail.characterModal.spoilers")} · {t("detail.characterModal.revealSpoilers")}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {data?.description && (
            <p className="whitespace-pre-line border-l-2 border-primary/50 pl-4 text-[15px] leading-relaxed text-foreground/90">
              {data.description}
            </p>
          )}

          {data?.sections.map((section) => {
            const Icon = sectionIcon(section.title);
            return (
              <article
                key={section.title}
                className="rounded-xl border border-border/60 bg-card/50 p-4"
              >
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-primary" />
                  {section.title}
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                  {section.body}
                </p>
              </article>
            );
          })}
        </>
      )}
    </div>
  );
}
