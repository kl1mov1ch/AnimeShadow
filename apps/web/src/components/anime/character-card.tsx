import type { Character } from "@animeshadow/shared";
import { StarIcon } from "lucide-react";
import { useState } from "react";
import { PosterFallback } from "@/components/anime/poster-fallback";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useCharacterDetail } from "@/lib/query";
import { cn } from "@/lib/utils";

interface CharacterCardProps {
  character: Character;
  /** Bigger treatment for a main character (horizontal card). */
  prominent?: boolean;
  /** Portrait tile for dense grids. */
  compact?: boolean;
  /** Opens the full-bio modal for this character. */
  onSelect?: (character: Character) => void;
}

/**
 * Hover preview: a one-line teaser, fetched only once the user actually
 * hovers — the full bio lives in the modal.
 */
function HoverPreview({
  character,
  children,
}: {
  character: Character;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, isPending } = useCharacterDetail(open ? character.id : null);

  return (
    <Tooltip onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-60 text-left">
        <p className="font-medium">{character.name}</p>
        {isPending ? (
          <Skeleton className="mt-1 h-3 w-32 bg-foreground/20" />
        ) : data?.description ? (
          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{data.description}</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("detail.characterModal.clickForMore")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function CharacterCard({
  character,
  prominent = false,
  compact = false,
  onSelect,
}: CharacterCardProps) {
  const t = useT();
  const isMain = character.role.toLowerCase() === "main";
  const roleLabel = isMain ? t("detail.mainRole") : character.role;

  if (compact) {
    return (
      <HoverPreview character={character}>
        <button
          type="button"
          onClick={() => onSelect?.(character)}
          title={roleLabel}
          className="group flex w-full flex-col items-center gap-1.5 rounded-xl p-1 text-center outline-none transition-colors hover:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* A round avatar that fills its grid cell (w-full + aspect-square,
              not a fixed pixel size) — so it's exactly the grid's own column
              math (6 per row on phone, more and bigger as the viewport
              grows) that decides how big it renders, with no breakpoint
              juggling here. The main-character mark is a small corner star
              instead of a text pill, so it stays out of the way of the name
              below at any size. */}
          <div className="relative w-full">
            <div
              className={cn(
                "aspect-square w-full overflow-hidden rounded-full border-2 bg-muted transition-[transform,border-color] duration-300 group-hover:-translate-y-0.5 motion-reduce:group-hover:translate-y-0",
                isMain ? "border-primary" : "border-border/60 group-hover:border-primary/40",
              )}
            >
              {character.imageUrl ? (
                <img
                  src={imageSrc(character.imageUrl)}
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

          <p className="line-clamp-2 w-full text-[11px] font-medium leading-tight sm:text-xs">
            {character.name}
          </p>
        </button>
      </HoverPreview>
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
        {character.voiceActor && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {character.voiceActor.name}
          </p>
        )}
      </div>
    </button>
  );
}
