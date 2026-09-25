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
  UserIcon,
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
type Tab = "about" | "voices" | "anime" | "manga";

/**
 * Full character profile: the photos on the left (a gallery when there's
 * more than one), everything known about them on the right.
 *
 * The voice cast and the anime and manga they appear in used to open as
 * three more dialogs on top of this one — a narrow list inside a modal
 * inside a modal, which on a phone meant two close buttons and no idea
 * which one went where. They are tabs of this dialog now, drawn the way
 * the rest of the site draws them: posters for titles, photo cards for
 * actors. The stat tiles at the top switch to them.
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
      <DialogContent className="thin-scroll flex max-h-[92dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-y-auto md:overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.08] via-background to-background p-0 sm:max-w-5xl md:h-[min(88dvh,780px)] md:flex-row">
        {character && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{character.name}</DialogTitle>
              <DialogDescription>{character.role}</DialogDescription>
            </DialogHeader>

            <CharacterGallery key={`g-${character.id}`} character={character} data={data} />

            <CharacterInfo
              key={`i-${character.id}`}
              character={character}
              data={data}
              isPending={isPending}
              isError={isError}
            />
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

  const arrow =
    "group absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg border border-primary/30 bg-background/85 text-foreground shadow-md transition-all duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-90";

  return (
    <div className="relative flex shrink-0 flex-col gap-2.5 border-b border-[var(--accent-line-soft)] p-3 md:w-[40%] md:border-b-0 md:border-r md:p-4">
      <div className="relative h-60 overflow-hidden rounded-xl border border-primary/25 bg-card min-[420px]:h-72 sm:h-80 md:h-auto md:min-h-0 md:flex-1">
        {current ? (
          <>
            {/* The same picture, blown up and dimmed, fills the letterbox
                around a portrait instead of flat grey bars. */}
            <img
              aria-hidden
              src={imageSrc(current)}
              alt=""
              className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-2xl"
            />
            <img
              key={current}
              src={imageSrc(current)}
              alt={character.name}
              className="relative size-full animate-in object-contain fade-in duration-300"
            />
          </>
        ) : (
          <PosterFallback title={character.name} seed={character.id} variant="avatar" />
        )}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/80 to-transparent" />

        {images.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label={t("common.previous")} className={cn(arrow, "left-2")}>
              <ChevronLeftIcon className="size-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label={t("common.next")} className={cn(arrow, "right-2")}>
              <ChevronRightIcon className="size-5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-primary/30 bg-background/85 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
              {safeIndex + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="thin-scroll flex gap-1.5 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}`}
              aria-current={i === safeIndex}
              className={cn(
                "h-14 w-10 shrink-0 overflow-hidden rounded-md border-2 transition-all duration-200",
                i === safeIndex ? "border-primary shadow-md shadow-primary/30" : "border-transparent opacity-55 hover:opacity-100",
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
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  active?: boolean;
  /** Present when there's more behind this stat — switches to its tab. */
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "group flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-300",
        active ? "border-primary bg-primary/15 shadow-md shadow-primary/15" : "border-[var(--accent-line-soft)] bg-card/60",
        onClick && !active && "hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.08]",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/15 text-primary transition-transform duration-300 group-hover:scale-105 [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
      {onClick && (
        <ChevronRightIcon className={cn("size-4 shrink-0 transition-transform", active ? "rotate-90 text-primary" : "text-muted-foreground")} />
      )}
    </Tag>
  );
}

/** Titles the character appears in, as posters. Anime go to their page;
 *  manga have no page on this site, so they are only shown. */
function AppearanceGrid({ kind, items }: { kind: "anime" | "manga"; items: AppearanceItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 min-[480px]:grid-cols-4 lg:grid-cols-5">
      {items.map((item, i) => {
        const inner = (
          <>
            <span className="relative block aspect-[2/3] overflow-hidden rounded-lg border border-[var(--accent-line-soft)] bg-card transition-colors group-hover:border-primary">
              {item.imageUrl ? (
                <img
                  src={imageSrc(item.imageUrl)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <PosterFallback title={item.title} seed={item.id} variant="avatar" />
              )}
              {item.year && (
                <span className="absolute left-1 top-1 rounded bg-black/75 px-1 py-px text-[10px] font-semibold tabular-nums text-white">
                  {item.year}
                </span>
              )}
            </span>
            <span className="line-clamp-2 break-words text-xs font-medium leading-snug transition-colors group-hover:text-primary">
              {item.title}
            </span>
            {item.kind && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.kind.replace(/_/g, " ")}</span>}
          </>
        );
        const cls = "group flex min-w-0 animate-in flex-col gap-1 fade-in-0 slide-in-from-bottom-1 duration-300";
        const style = { animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "both" };
        return kind === "anime" ? (
          <Link key={item.id} to={`/anime/${item.id}`} className={cls} style={style}>
            {inner}
          </Link>
        ) : (
          <div key={item.id} className={cls} style={style}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** Every credited voice, with a real-size photo. */
function VoiceGrid({ actors }: { actors: SeiyuItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3">
      {actors.map((actor, i) => (
        <div
          key={`${actor.name}-${i}`}
          className="flex min-w-0 animate-in flex-col items-center gap-2 rounded-xl border border-[var(--accent-line-soft)] bg-card/60 p-3 text-center fade-in-0 slide-in-from-bottom-1 duration-300"
          style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "both" }}
        >
          <span className="size-20 overflow-hidden rounded-full border-2 border-primary/40 bg-muted shadow-md shadow-primary/15">
            {actor.imageUrl ? (
              <img src={imageSrc(actor.imageUrl)} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <PosterFallback title={actor.name} seed={i} variant="avatar" />
            )}
          </span>
          <span className="line-clamp-2 break-words text-sm font-medium leading-snug">{actor.name}</span>
          {i === 0 && <MicIcon className="size-3.5 text-primary" />}
        </div>
      ))}
    </div>
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
  const [tab, setTab] = useState<Tab>("about");
  const isMain = character.role.toLowerCase() === "main";
  const voice = character.voiceActor ?? data?.seiyu[0] ?? null;
  // The tile shows one name; the tab behind it shows every credited actor
  // Shikimori knows, falling back to the one the character list already had.
  const voiceActors: SeiyuItem[] =
    data && data.seiyu.length > 0
      ? data.seiyu
      : character.voiceActor
        ? [{ name: character.voiceActor.name, imageUrl: character.voiceActor.imageUrl }]
        : [];
  const subtitle = [data?.originalName, data?.japaneseName].filter(Boolean).join(" · ");
  const hasText =
    Boolean(data?.description) || (data?.sections.length ?? 0) > 0 || (data?.facts.length ?? 0) > 0;

  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; count?: number }> = [
    { id: "about", label: t("detail.characterModal.tabAbout"), icon: UserIcon },
    ...(voiceActors.length > 0
      ? [{ id: "voices" as const, label: t("detail.characterModal.tabVoices"), icon: MicIcon, count: voiceActors.length }]
      : []),
    ...(data && data.animes.length > 0
      ? [{ id: "anime" as const, label: t("detail.characterModal.tabAnime"), icon: FilmIcon, count: data.animeCount ?? data.animes.length }]
      : []),
    ...(data && data.mangas.length > 0
      ? [{ id: "manga" as const, label: t("detail.characterModal.tabManga"), icon: BookMarkedIcon, count: data.mangaCount ?? data.mangas.length }]
      : []),
  ];
  const toggle = (next: Tab) => setTab((cur) => (cur === next ? "about" : next));

  return (
    // On a phone the whole dialog scrolls (picture included), so the tabs
    // get the full height; side by side, only this column does.
    <div className="thin-scroll flex flex-col md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-col gap-2 pr-8">
          <span
            className={cn(
              "w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold",
              isMain ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "border border-primary/30 bg-primary/10 text-primary",
            )}
          >
            {isMain ? t("detail.mainRole") : character.role}
          </span>
          <h2 className="font-display text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">
            {data?.name ?? character.name}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {data && data.aliases.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">{t("detail.characterModal.aliases")}</span>
              {data.aliases.map((alias) => (
                <span key={alias} className="rounded-md border border-primary/25 bg-primary/5 px-2 py-0.5 text-xs">
                  {alias}
                </span>
              ))}
            </div>
          )}
        </header>

        {(voice || data?.animeCount || data?.mangaCount) && (
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
            {voice && (
              <StatTile
                icon={
                  voice.imageUrl ? (
                    <img src={imageSrc(voice.imageUrl)} alt="" className="size-9 object-cover" />
                  ) : (
                    <MicIcon />
                  )
                }
                label={t("detail.characterModal.voicedBy")}
                value={voice.name}
                active={tab === "voices"}
                onClick={voiceActors.length > 0 ? () => toggle("voices") : undefined}
              />
            )}
            {data?.animeCount ? (
              <StatTile
                icon={<FilmIcon />}
                label={t("detail.characterModal.appearsInAnime")}
                value={data.animeCount}
                active={tab === "anime"}
                onClick={data.animes.length > 0 ? () => toggle("anime") : undefined}
              />
            ) : null}
            {data?.mangaCount ? (
              <StatTile
                icon={<BookMarkedIcon />}
                label={t("detail.characterModal.appearsInManga")}
                value={data.mangaCount}
                active={tab === "manga"}
                onClick={data.mangas.length > 0 ? () => toggle("manga") : undefined}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Sticks to the top of the scrolling panel, so switching is always
          one reach away however far down the bio you are. */}
      {tabs.length > 1 && (
        <div className="sticky top-0 z-10 border-y border-[var(--accent-line-soft)] bg-background/95 px-4 py-2 sm:px-6">
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95",
                  tab === id
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                )}
              >
                <Icon className="size-3.5" />
                {label}
                {count != null && (
                  <span className={cn("rounded px-1 tabular-nums", tab === id ? "bg-black/20" : "bg-primary/10 text-primary")}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div key={tab} className="flex animate-in flex-col gap-5 p-4 fade-in-0 duration-300 sm:p-6">
        {tab === "voices" && <VoiceGrid actors={voiceActors} />}
        {tab === "anime" && <AppearanceGrid kind="anime" items={data?.animes ?? []} />}
        {tab === "manga" && <AppearanceGrid kind="manga" items={data?.mangas ?? []} />}
        {tab === "about" &&
          (isPending ? (
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
                      // Sticky to the panel's middle, so with a long list the
                      // button is on screen as soon as the list is.
                      <div className="pointer-events-none sticky top-1/2 z-10 flex h-0 justify-center">
                        <button
                          type="button"
                          onClick={() => setRevealed(true)}
                          className="btn-sheen pointer-events-auto inline-flex -translate-y-1/2 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
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
                <p className="whitespace-pre-line border-l-2 border-primary/60 pl-4 text-[15px] leading-relaxed text-foreground/90">
                  {data.description}
                </p>
              )}

              {data?.sections.map((section) => {
                const Icon = sectionIcon(section.title);
                return (
                  <article key={section.title} className="rounded-xl border border-[var(--accent-line-soft)] bg-card/50 p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
                        <Icon className="size-4" />
                      </span>
                      {section.title}
                    </h3>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{section.body}</p>
                  </article>
                );
              })}
            </>
          ))}
      </div>
    </div>
  );
}
