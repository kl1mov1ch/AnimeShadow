import type { Character } from "@animeshadow/shared";
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
  /** Vertical avatar-over-name tile for dense grids. */
  compact?: boolean;
  /** Opens the full-bio modal for this character. */
  onSelect?: (character: Character) => void;
}

/** Hover preview: a one-line teaser, fetched only once the user actually hovers. */
function HoverPreview({ character }: { character: Character }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, isPending } = useCharacterDetail(open ? character.id : null);

  return (
    <Tooltip onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span className="absolute inset-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-left">
        <p className="font-medium">{character.name}</p>
        {isPending ? (
          <Skeleton className="mt-1 h-3 w-32 bg-foreground/20" />
        ) : data?.description ? (
          <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
            {data.description}
          </p>
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
      <button
        type="button"
        onClick={() => onSelect?.(character)}
        className="group relative flex flex-col items-center gap-1.5 text-center"
      >
        <HoverPreview character={character} />
        <div className="size-16 overflow-hidden rounded-full border border-border/60 bg-muted transition-transform duration-200 group-hover:-translate-y-0.5 sm:size-20">
          {character.imageUrl ? (
            <img
              src={imageSrc(character.imageUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <PosterFallback
              title={character.name}
              seed={character.id}
              variant="avatar"
            />
          )}
        </div>
        <p className="line-clamp-2 text-xs font-medium leading-tight">
          {character.name}
        </p>
        <p
          className={cn(
            "text-[11px]",
            isMain ? "text-primary" : "text-muted-foreground",
          )}
        >
          {roleLabel}
        </p>
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
          <PosterFallback
            title={character.name}
            seed={character.id}
            variant="avatar"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p
          className={cn(
            "truncate font-medium",
            prominent ? "text-base" : "text-sm",
          )}
        >
          {character.name}
        </p>
        <p
          className={cn(
            "text-xs",
            isMain ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
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
