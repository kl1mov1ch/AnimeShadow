import type { Character } from "@animeshadow/shared";
import { SparklesIcon } from "lucide-react";
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

/**
 * Full bio for a character, opened from a click on any character card. Photo,
 * role and voice actor come from the list data the card already has (instant);
 * the description is fetched lazily and translated server-side to the active
 * locale, so nothing blocks the modal from opening immediately.
 *
 * Shikimori is the only image source we have here (one photo, no gallery —
 * a second provider's id doesn't reliably match the same character, so we
 * don't guess). What it does give us: editors tag genuine trivia inside
 * spoiler blocks, which the API splits out as `facts` instead of leaving
 * them buried in one paragraph.
 */
export function CharacterModal({
  character,
  onOpenChange,
}: {
  character: Character | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { data, isPending, isError } = useCharacterDetail(character?.id ?? null);
  const photo = data?.imageLargeUrl ?? character?.imageUrl ?? null;

  return (
    <Dialog open={character != null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-md flex-col gap-0 overflow-y-auto p-0">
        {character && (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>{character.name}</DialogTitle>
              <DialogDescription>{character.role}</DialogDescription>
            </DialogHeader>

            {/* A round avatar reads as a portrait, not a stretched banner —
                and at this size a modest-resolution photo stays crisp
                instead of getting smeared across a big rectangle. */}
            <div className="flex flex-col items-center gap-3 border-b border-border/60 bg-gradient-to-b from-primary/[0.07] to-transparent px-5 pb-5 pt-7 text-center">
              <div className="size-28 shrink-0 overflow-hidden rounded-full border-2 border-border/60 bg-muted shadow-md">
                {photo ? (
                  <img
                    src={imageSrc(photo)}
                    alt=""
                    className="size-full object-cover object-top"
                  />
                ) : (
                  <PosterFallback title={character.name} seed={character.id} variant="avatar" />
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="font-display text-xl text-foreground">
                  {character.name}
                </h2>
                {data?.japaneseName && (
                  <p className="text-xs text-muted-foreground">{data.japaneseName}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {character.role}
                </span>
                {character.voiceActor && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-2.5 py-1 text-xs text-muted-foreground">
                    {character.voiceActor.imageUrl && (
                      <img
                        src={imageSrc(character.voiceActor.imageUrl)}
                        alt=""
                        className="size-4 rounded-full object-cover"
                      />
                    )}
                    {t("detail.characterModal.voicedBy")}{" "}
                    <span className="font-medium text-foreground">
                      {character.voiceActor.name}
                    </span>
                  </span>
                )}
              </div>

              {isPending ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              ) : isError ? (
                <p className="text-sm text-muted-foreground">
                  {t("detail.characterModal.loadError")}
                </p>
              ) : (
                <>
                  {data?.description ? (
                    // Set apart in its own bordered/tinted block instead of
                    // running text, so it reads as "the bio" at a glance.
                    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                        {data.description}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("detail.characterModal.noDescription")}
                    </p>
                  )}

                  {data && data.facts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <SparklesIcon className="size-3.5 text-primary" />
                        {t("detail.characterModal.facts")}
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {data.facts.map((fact, i) => (
                          <li
                            key={i}
                            className="rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-sm leading-relaxed text-foreground/90"
                          >
                            {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
