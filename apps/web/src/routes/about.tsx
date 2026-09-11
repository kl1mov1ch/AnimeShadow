import type { CSSProperties } from "react";
import { BookOpenIcon, ListChecksIcon, MoonIcon, PlayIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function Component() {
  const t = useT();

  const features = [
    { Icon: BookOpenIcon, title: t("about.features.catalogTitle"), body: t("about.features.catalogBody") },
    { Icon: ListChecksIcon, title: t("about.features.trackTitle"), body: t("about.features.trackBody") },
    { Icon: PlayIcon, title: t("about.features.playerTitle"), body: t("about.features.playerBody") },
    { Icon: MoonIcon, title: t("about.features.calmTitle"), body: t("about.features.calmBody") },
  ];

  return (
    <div className="reveal-group mx-auto flex max-w-3xl flex-col gap-14 py-8">
      <header className="reveal flex flex-col gap-4" style={{ "--i": 0 } as CSSProperties}>
        <span aria-hidden className="font-display text-5xl text-primary">
          影
        </span>
        <h1 className="font-display text-3xl sm:text-4xl">{t("about.title")}</h1>
        <p className="max-w-prose text-lg text-muted-foreground">{t("about.lead")}</p>
      </header>

      <section className="reveal flex flex-col gap-3" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("about.whyTitle")}</h2>
        <p className="max-w-prose leading-relaxed text-foreground/90">{t("about.whyBody")}</p>
        <p className="max-w-prose leading-relaxed text-foreground/90">{t("about.whatBody")}</p>
      </section>

      <section className="reveal flex flex-col gap-5" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-xl">{t("about.featuresTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-border"
            >
              <Icon className="size-5 text-primary" />
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="support"
        className="reveal flex flex-col gap-3 scroll-mt-24"
        style={{ "--i": 3 } as CSSProperties}
      >
        <h2 className="font-display text-xl">{t("about.howTitle")}</h2>
        <p className="max-w-prose leading-relaxed text-foreground/90">{t("about.howBody")}</p>
        <h2 className="mt-4 font-display text-xl">{t("about.supportTitle")}</h2>
        <p className="max-w-prose leading-relaxed text-foreground/90">{t("about.supportBody")}</p>
      </section>

      <section
        className="reveal flex flex-col items-start gap-4 rounded-2xl border border-border/60 bg-card/40 p-6"
        style={{ "--i": 4 } as CSSProperties}
      >
        <h2 className="font-display text-xl">{t("about.ctaTitle")}</h2>
        <Button asChild>
          <Link to="/browse">{t("about.ctaButton")}</Link>
        </Button>
      </section>
    </div>
  );
}
