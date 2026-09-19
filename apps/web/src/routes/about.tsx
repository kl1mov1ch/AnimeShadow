import type { CSSProperties } from "react";
import { BookOpenIcon, HeartIcon, ListChecksIcon, MoonIcon, PlayIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { BOOSTY_URL } from "@/lib/support-links";
import { useReactionGif } from "@/lib/query";
import { cn } from "@/lib/utils";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

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
      className={cn(
        "animate-in fade-in zoom-in-95 rounded-2xl object-cover shadow-lg duration-700",
        className ?? "size-24 sm:size-32",
      )}
    />
  );
}

/** The band of light the site's deliberate actions sweep on hover. */
function Sheen({ tone = "light" }: { tone?: "primary" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
        tone === "light" ? "via-white/40" : "via-primary/30",
      )}
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
    <div className="reveal-group mx-auto flex max-w-3xl flex-col gap-10 py-8 sm:gap-14">
      {/* Hero — the wordmark glyph plus a bit of life instead of a bare
          heading; this is the page that's supposed to feel like a person
          made it, not a terms-of-service document. */}
      <header
        className="reveal relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        style={{ "--i": 0 } as CSSProperties}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-12 select-none font-display text-[11rem] leading-none text-primary/[0.06]"
        >
          <SlicedGlyph />
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        />

        <div className="relative flex flex-col gap-3">
          <span aria-hidden className="font-display text-5xl text-primary">
            <SlicedGlyph />
          </span>
          <h1 className="font-display text-3xl sm:text-4xl">{t("about.title")}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">{t("about.lead")}</p>
        </div>
        <Gif category="happy" className="relative hidden shrink-0 sm:block sm:size-32" />
      </header>

      <section
        className="reveal flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/40 p-5 transition-colors duration-300 hover:border-primary/25 sm:flex-row sm:items-center"
        style={{ "--i": 1 } as CSSProperties}
      >
        <Gif category="wave" className="size-20 shrink-0 self-center rounded-xl sm:size-24" />
        <p className="leading-relaxed text-foreground/90">{t("about.introBody")}</p>
      </section>

      <section className="reveal flex flex-col gap-5" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("about.featuresTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, body }, i) => (
            <div
              key={title}
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
              className="animate-in fade-in zoom-in-95 group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-4 duration-500 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
            >
              <span className="relative z-10 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <h3 className="relative z-10 font-medium">{title}</h3>
              <p className="relative z-10 text-sm text-muted-foreground">{body}</p>
              <Sheen tone="primary" />
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
        className="reveal relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-primary/30 bg-primary/[0.06] p-6 shadow-[0_0_50px_-20px] shadow-primary/25 scroll-mt-24 sm:flex-row sm:items-center sm:justify-between"
        style={{ "--i": 4 } as CSSProperties}
      >
        <div className="flex items-start gap-4">
          <Gif category="highfive" className="hidden size-20 shrink-0 rounded-xl sm:block" />
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
        <Button
          asChild
          size="lg"
          className="group relative shrink-0 overflow-hidden rounded-full bg-gradient-to-r from-primary via-primary/85 to-primary font-semibold shadow-lg shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40"
        >
          <a href={BOOSTY_URL} target="_blank" rel="noreferrer">
            <HeartIcon className="relative z-10 fill-current" />
            <span className="relative z-10">{t("about.supportCta")}</span>
            <Sheen />
          </a>
        </Button>
      </section>

      <section
        className="reveal flex flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card/40 p-6 transition-colors duration-300 hover:border-primary/25 sm:flex-row sm:items-center sm:justify-between"
        style={{ "--i": 5 } as CSSProperties}
      >
        <div className="flex items-center gap-4">
          <Gif category="dance" className="hidden size-16 shrink-0 rounded-xl sm:block" />
          <h2 className="font-display text-xl">{t("about.ctaTitle")}</h2>
        </div>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="group relative shrink-0 overflow-hidden rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
        >
          <Link to="/browse">
            <span className="relative z-10">{t("about.ctaButton")}</span>
            <Sheen tone="primary" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
