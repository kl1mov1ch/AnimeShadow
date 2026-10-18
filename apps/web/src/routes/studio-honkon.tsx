import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  HeadphonesIcon,
  MailIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StudioCatalog } from "@/components/studio/studio-catalog";
import { StudioTeam } from "@/components/studio/studio-team";
import { StudioEndnote, StudioMark } from "@/components/studio/studio-shared";
import { STUDIO_LINKS } from "@/components/studio/studio-links";
import { STUDIO_PATH, useStudioCatalog } from "@/components/studio/studio-data";
import { useDocumentHead } from "@/lib/seo";
import "@/components/studio/studio.css";
import members from "@/components/studio/honkon-team.json";
import { StudioVideos } from "@/components/studio/studio-videos";
import { StudioAdminTools } from "@/components/studio/studio-admin-tools";
import { useStudioMotion } from "@/components/studio/use-studio-motion";

export function Component() {
  useDocumentHead({
    title: "Hon-Kon Studio — команда, релизы и озвучка | AnimeShadow",
    description:
      "Познакомьтесь с командой Hon-Kon Studio: голоса, перевод, звук и аниме на AnimeShadow.",
  });
  const catalog = useStudioCatalog();
  const releases = catalog.data?.releases ?? [];
  const motion = useStudioMotion(
    `${releases.length}:${catalog.data?.index?.videos.length ?? 0}:${catalog.data?.index?.uploads?.length ?? 0}`,
  );
  return (
    <div className="hk-page" ref={motion}>
      <section className="hk-hero" aria-labelledby="hk-title">
        <div className="hk-hero-content">
          <div className="hk-hero-brand">
            <StudioMark animated />
            <h1 id="hk-title">
              Hon-Kon
              <span>
                Studio<span className="hk-title-dot">.</span>
              </span>
            </h1>
          </div>
          <p className="hk-hero-lead">
            У каждого персонажа — свой голос.
            <br />У каждой истории — люди, которые в неё верят.
          </p>
          <div className="hk-hero-actions">
            <Button size="lg" asChild>
              <a href="#hk-releases">
                <HeadphonesIcon data-icon="inline-start" /> Выбрать аниме
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="#hk-team">
                Команда студии
                <ArrowRightIcon aria-hidden />
              </a>
            </Button>
          </div>
        </div>
        <div className="hk-candy" aria-hidden>
          <img
            src="/studios/hon-kon/lollipop-coral-v3.webp"
            alt=""
            width="1000"
            height="1000"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </section>
      <StudioCatalog
        releases={releases}
        loading={catalog.isPending}
        error={catalog.isError}
        retry={() => void catalog.refetch()}
        compact
      />
      <StudioVideos
        videos={catalog.data?.index?.uploads ?? []}
        heading="Другие релизы студии"
      />
      <StudioVideos videos={catalog.data?.index?.videos ?? []} />
      <StudioAdminTools />
      <StudioTeam />
      <section
        id="hk-about"
        className="hk-about-section"
        aria-labelledby="hk-about-title"
      >
        <div>
          <p className="hk-eyebrow">За кадром</p>
          <h2 id="hk-about-title">
            Любимое дело.
            <br />
            Знакомые голоса.
          </h2>
          <StudioMark />
        </div>
        <div className="hk-about-copy">
          <p>
            Hon-Kon — команда энтузиастов, которые переводят и озвучивают аниме.
            Дабберы, сабберы и звукорежиссёры собирают каждую историю вместе — от первых
            реплик до финального звука.
          </p>
          <p>
            Здесь можно познакомиться с участниками, найти их публичные страницы и
            выбрать следующий тайтл. Новые серии и жизнь команды — на площадках студии.
          </p>
          <div className="hk-about-links">
            {STUDIO_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <StudioMark small />
                <span>
                  {link.label}
                  <small>{link.hint}</small>
                </span>
                <ArrowUpRightIcon aria-hidden />
              </a>
            ))}
          </div>
          <div className="hk-team-strip" aria-label="Голоса Hon-Kon">
            {members
              .filter((member) => member.role === "Дабберы")
              .slice(0, 5)
              .map((member) => (
                <a
                  key={member.name}
                  href="#hk-team"
                  title={`Познакомиться с ${member.name}`}
                >
                  <img
                    src={member.image}
                    width={96}
                    height={96}
                    alt={member.name}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>{member.name}</span>
                </a>
              ))}
          </div>
          <a className="hk-contact" href="mailto:honkonstudio@yandex.com">
            <MailIcon aria-hidden />
            <span>honkonstudio@yandex.com</span>
            <ArrowUpRightIcon aria-hidden />
          </a>
        </div>
      </section>
      <section className="hk-between">
        <StudioMark small />
        <p>
          Аниме объединяет.
          <br />
          <span>Голоса делают его ближе.</span>
        </p>
        <Link className="hk-text-link" to={`${STUDIO_PATH}/releases`}>
          Найти свою историю
          <ArrowRightIcon aria-hidden />
        </Link>
      </section>
      <StudioEndnote />
    </div>
  );
}
