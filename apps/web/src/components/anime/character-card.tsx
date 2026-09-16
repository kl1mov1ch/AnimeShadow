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
          className="group relative block w-full overflow-hidden rounded-xl border border-border/60 bg-muted text-left outline-none transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0"
        >
          <div className="aspect-[3/4] w-full">
            {character.imageUrl ? (
              <img
                src={imageSrc(character.imageUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
              />
            ) : (
              <PosterFallback title={character.name} seed={character.id} variant="avatar" />
            )}
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent"
          />

          {isMain && (
            <span className="absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground shadow sm:left-2 sm:top-2 sm:max-w-[calc(100%-1rem)] sm:px-2 sm:text-[10px]">
              {roleLabel}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
              {character.name}
            </p>
            <p className="truncate text-[11px] text-white/70">
              {character.voiceActor?.name ?? roleLabel}
            </p>
          </div>
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
