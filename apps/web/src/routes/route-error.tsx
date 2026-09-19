import { useState } from "react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { useReactionGif } from "@/lib/query";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

/**
 * Same custom-error look as RootError, but scoped to sit inside AppShell's
 * <main> instead of replacing it — a crash on one page shouldn't also take
 * the header/nav/footer down with it, or strand the visitor with no way to
 * get anywhere else on the site.
 */
export function RouteError() {
  const t = useT();
  // Same reasoning as RootError: whatever actually threw stays in the
  // console/error tracker, not on the page.
  useRouteError();
  const gif = useReactionGif("cry");
  // Gif first, the site's mark if it does not come or will not load.
  const [gifBroken, setGifBroken] = useState(false);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="size-28 overflow-hidden rounded-2xl bg-muted">
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
