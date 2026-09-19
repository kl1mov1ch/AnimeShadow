import type { CSSProperties } from "react";
import { CompassIcon, HomeIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

export function Component() {
  const t = useT();
  return (
    <div className="reveal-group relative mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 py-16 text-center">
      {/* Ambient glow behind the glyph — same warm wash as the rest of the site,
          just parked here instead of following a poster's colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="reveal flex items-baseline gap-2" style={{ "--i": 0 } as CSSProperties}>
        <span className="font-display text-7xl tabular-nums text-foreground/90 sm:text-8xl">
          4
        </span>
        <span
          aria-hidden
          className="not-found-glyph font-display text-7xl text-primary motion-safe:animate-[lost-glyph-float_3.2s_ease-in-out_infinite] sm:text-8xl"
        >
          <SlicedGlyph />
        </span>
        <span className="font-display text-7xl tabular-nums text-foreground/90 sm:text-8xl">
          4
        </span>
      </div>

      <h1
        className="reveal font-display text-2xl"
        style={{ "--i": 1 } as CSSProperties}
      >
        {t("errors.notFoundTitle")}
      </h1>
      <p
        className="reveal max-w-sm text-sm text-muted-foreground"
        style={{ "--i": 2 } as CSSProperties}
      >
        {t("errors.notFoundBody")}
      </p>

      <div className="reveal flex flex-wrap items-center justify-center gap-3" style={{ "--i": 3 } as CSSProperties}>
        <Button asChild>
          <Link to="/">
            <HomeIcon />
            {t("errors.backToDiscover")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/browse">
            <CompassIcon />
            {t("nav.browse")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
