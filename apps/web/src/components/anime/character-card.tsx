import type { Character, CharacterDetail } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { StarIcon } from "lucide-react";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useLocale, useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The catalogue's role names, in Russian. */
export function roleName(role: string): string {
  const r = role.toLowerCase();
  if (r === "main") return "Главный герой";
  if (r === "supporting") return "Второстепенный";
  if (r === "background") return "Эпизодический";
  return role;
}

interface CharacterCardProps {
  character: Character;
  /** Bigger treatment for a main character (horizontal card). */
  prominent?: boolean;
  /** Portrait tile for dense grids. */
  compact?: boolean;
  /** Opens the full-bio modal for this character. */
  onSelect?: (character: Character) => void;
}

export function CharacterCard({
  character,
  prominent = false,
  compact = false,
  onSelect,
}: CharacterCardProps) {
  const t = useT();
  const isMain = character.role.toLowerCase() === "main";
  const roleLabel = isMain ? t("detail.mainRole") : roleName(character.role);
  const client = useQueryClient();
  const { locale } = useLocale();
  const warm = () =>
    void client.prefetchQuery({
      queryKey: ["character", character.id, locale],
      queryFn: ({ signal }) => apiRequest<CharacterDetail>(`/characters/${character.id}`, { signal, query: { lang: locale } }),
      staleTime: 30 * 60_000,
    });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const prefetch = {
    onPointerEnter: () => {
      timer = setTimeout(warm, 120);
    },
    onPointerLeave: () => timer && clearTimeout(timer),
    onTouchStart: warm,
    onFocus: warm,
  };

  if (compact) {
    return (
        <button
          type="button"
          onClick={() => onSelect?.(character)}
          {...prefetch}
          title={roleLabel}
          className="group flex min-h-16 w-full min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2 text-left outline-none transition-colors hover:border-primary/35 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* A round avatar that fills its grid cell (w-full + aspect-square,
              not a fixed pixel size) — so it's exactly the grid's own column
              math (6 per row on phone, more and bigger as the viewport
              grows) that decides how big it renders, with no breakpoint
              juggling here. The main-character mark is a small corner star
              instead of a text pill, so it stays out of the way of the name
              below at any size. */}
          <div className="relative w-11 shrink-0 sm:w-12">
            <div
              className={cn(
                "aspect-square w-full overflow-hidden rounded-xl border bg-muted",
                isMain ? "border-primary" : "border-border/60 group-hover:border-primary/40",
              )}
            >
              {character.imageUrl ? (
                <img
                  src={imageSrc(character.imageUrl, 240)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover object-top"
                />
              ) : (
                <PosterFallback title={character.name} seed={character.id} variant="avatar" />
              )}
            </div>
            {isMain && (
              <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground sm:size-4">
                <StarIcon className="size-[7px] fill-current sm:size-2" />
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1"><p className="line-clamp-2 w-full text-[11px] font-medium leading-snug sm:text-xs">
            {character.name}
          </p>
          {/* Who plays them, when we know it — the reason "who voices this
              character" doesn't require opening the modal on every single
              one of a dozen names. */}
          <p className={cn("line-clamp-1 w-full text-[10px]", isMain ? "font-semibold text-primary" : "text-muted-foreground")}>
            {roleLabel}
          </p></div>
        </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect?.(character)}
      className={cn(
        "flex w-full gap-3 rounded-lg border bg-card p-2 text-left transition-colors hover:border-border",
        prominent && "p-3",
      )}
    >
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-md bg-muted",
          prominent ? "size-20" : "size-14",
        )}
      >
        {character.imageUrl ? (
          <img
            src={imageSrc(character.imageUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <PosterFallback title={character.name} seed={character.id} variant="avatar" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className={cn("truncate font-medium", prominent ? "text-base" : "text-sm")}>
          {character.name}
        </p>
        <p className={cn("text-xs", isMain ? "font-medium text-primary" : "text-muted-foreground")}>
          {roleLabel}
        </p>
      </div>
    </button>
  );
}
