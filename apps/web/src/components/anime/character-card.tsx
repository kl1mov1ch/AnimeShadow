import type { Character } from "@animeshadow/shared";
import { PosterFallback } from "@/components/anime/poster-fallback";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CharacterCardProps {
  character: Character;
  /** Bigger treatment for a main character (horizontal card). */
  prominent?: boolean;
  /** Vertical avatar-over-name tile for dense grids. */
  compact?: boolean;
}

export function CharacterCard({
  character,
  prominent = false,
  compact = false,
}: CharacterCardProps) {
  const t = useT();
  const isMain = character.role.toLowerCase() === "main";
  const roleLabel = isMain ? t("detail.mainRole") : character.role;

  if (compact) {
    return (
      <div className="group flex flex-col items-center gap-1.5 text-center">
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border bg-card p-2 transition-colors hover:border-border",
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
    </div>
  );
}
