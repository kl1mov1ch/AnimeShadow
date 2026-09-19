import { useState } from "react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { useReactionGif } from "@/lib/query";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

export function RootError() {
  const t = useT();
  // The raw error (a stack trace, a bare "Cannot read properties of
  // undefined", …) is for the console/error tracker, never the page — a
  // visitor gets the same friendly line regardless of what actually broke.
  // A crashed page is a bad moment already; a sad-anime-face gif reads as
  // "oops, our bad" instead of a wall of text nobody asked to read.
  useRouteError();
  const gif = useReactionGif("cry");
  // Gif first, the site's mark if it does not come or will not load.
  const [gifBroken, setGifBroken] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="size-32 overflow-hidden rounded-2xl bg-muted">
        {gif.data?.url && !gifBroken ? (
          <img
            src={gif.data.url}
            alt=""
            className="size-full object-cover"
            onError={() => setGifBroken(true)}
          />
        ) : (
          <p aria-hidden className="grid size-full place-items-center font-display text-5xl text-primary">
            <SlicedGlyph />
          </p>
        )}
      </div>
      <h1 className="font-display text-2xl">{t("errors.pageSnag")}</h1>
      <p className="text-sm text-muted-foreground">{t("errors.genericBody")}</p>
      <Button asChild>
        <Link to="/">{t("errors.backToDiscover")}</Link>
      </Button>
    </div>
  );
}
