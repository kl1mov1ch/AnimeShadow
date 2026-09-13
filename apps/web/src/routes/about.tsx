import type { CSSProperties } from "react";
import { BookOpenIcon, HeartIcon, ListChecksIcon, MoonIcon, PlayIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { BOOSTY_URL } from "@/lib/support-links";
import { useReactionGif } from "@/lib/query";

/** A small, purely decorative reaction gif — falls back to nothing (not a
 * broken box) if the fetch is slow or fails, since this is pure flavour. */
function Gif({ category, className }: { category: string; className?: string }) {
  const { data } = useReactionGif(category);
  if (!data?.url) return null;
  return (
    <img
      src={imageSrc(data.url)}
      alt=""
      loading="lazy"
      className={className ?? "size-24 rounded-2xl object-cover shadow-lg sm:size-32"}
    />
  );
}

export function Component() {
  const t = useT();

  const features = [
    { Icon: BookOpenIcon, title: t("about.features.catalogTitle"), body: t("about.features.catalogBody") },
    { Icon: ListChecksIcon, title: t("about.features.trackTitle"), body: t("about.features.trackBody") },
    { Icon: PlayIcon, title: t("about.features.playerTitle"), body: t("about.features.playerBody") },
    { Icon: MoonIcon, title: t("about.features.calmTitle"), body: t("about.features.calmBody") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-3xl flex-col gap-10 py-8">
      {/* Hero — the wordmark glyph plus a bit of life instead of a bare
          heading; this is the page that's supposed to feel like a person
          made it, not a terms-of-service document. */}
      <header
        className="reveal flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ "--i": 0 } as CSSProperties}
      >
        <div className="flex flex-col gap-3">
          <span aria-hidden className="font-display text-5xl text-primary">
            影
          </span>
          <h1 className="font-display text-3xl sm:text-4xl">{t("about.title")}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">{t("about.lead")}</p>
        </div>
        <Gif category="happy" className="hidden shrink-0 rounded-2xl object-cover shadow-lg sm:block sm:size-32" />
      </header>

      <section
        className="reveal flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-5 sm:flex-row sm:items-center"
        style={{ "--i": 1 } as CSSProperties}
      >
        <Gif category="wave" className="size-20 shrink-0 self-center rounded-xl object-cover sm:size-24" />
        <p className="leading-relaxed text-foreground/90">{t("about.introBody")}</p>
      </section>

      <section className="reveal flex flex-col gap-5" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("about.featuresTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/40"
            >
              <Icon className="size-5 text-primary" />
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="reveal flex flex-col gap-2" style={{ "--i": 3 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("about.howTitle")}</h2>
        <p className="max-w-prose leading-relaxed text-foreground/90">{t("about.howBody")}</p>
      </section>

      {/* The donation ask — its own warm, low-pressure moment at the end of
          the page, not a strict "pay us" wall. Links straight to Boosty. */}
      <section
        id="support"
        className="reveal flex flex-col items-start gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-6 scroll-mt-24 sm:flex-row sm:items-center sm:justify-between"
        style={{ "--i": 4 } as CSSProperties}
      >
        <div className="flex items-start gap-4">
          <Gif category="highfive" className="hidden size-20 shrink-0 rounded-xl object-cover sm:block" />
          <div className="flex flex-col gap-1.5">
            <h2 className="flex items-center gap-2 font-display text-xl">
              <HeartIcon className="size-5 text-primary" />
              {t("about.supportTitle")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {t("about.supportBody")}
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <a href={BOOSTY_URL} target="_blank" rel="noreferrer">
            <HeartIcon className="fill-current" />
            {t("about.supportCta")}
          </a>
        </Button>
      </section>

      <section
        className="reveal flex flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card/40 p-6 sm:flex-row sm:items-center sm:justify-between"
        style={{ "--i": 5 } as CSSProperties}
      >
        <div className="flex items-center gap-4">
          <Gif category="dance" className="hidden size-16 shrink-0 rounded-xl object-cover sm:block" />
          <h2 className="font-display text-xl">{t("about.ctaTitle")}</h2>
        </div>
        <Button asChild size="lg" variant="outline" className="shrink-0">
          <Link to="/browse">{t("about.ctaButton")}</Link>
        </Button>
      </section>
    </div>
  );
}
