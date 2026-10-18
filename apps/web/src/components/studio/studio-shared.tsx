import { ArrowUpRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { STUDIO_PATH } from "./studio-data";
import { StudioShare } from "./studio-share";

export function StudioMark({
  small = false,
  animated = false,
}: {
  small?: boolean;
  animated?: boolean;
}) {
  return (
    <span className={small ? "hk-mark hk-mark-small" : "hk-mark"}>
      <HonkonGlyph className="size-full" animated={animated} />
    </span>
  );
}
export function StudioNavigation({ workspace = false }: { workspace?: boolean }) {
  return (
    <nav className="hk-studio-nav" aria-label="Hon-Kon Studio">
      <Link to={STUDIO_PATH} className="hk-studio-wordmark">
        <StudioMark small />
        <span>
          <strong>hon-kon</strong>
          <small>Студия озвучки аниме</small>
        </span>
      </Link>
      <div className="hk-local-nav">
        <Link to={workspace ? `${STUDIO_PATH}#hk-releases` : `${STUDIO_PATH}/releases`}>
          Релизы
        </Link>
        <Link to={`${STUDIO_PATH}#hk-team`}>Команда</Link>
        <Link to={`${STUDIO_PATH}#hk-about`}>О студии</Link>
      </div>
      <a
        className="hk-original-site"
        href="https://www.hon-kon.ru/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Сайт Hon-Kon
        <ArrowUpRightIcon aria-hidden />
      </a>
    </nav>
  );
}
export function StudioEndnote({ releases = false }: { releases?: boolean }) {
  return (
    <footer className="hk-endnote">
      <span className="hk-footer-word" aria-hidden>
        HON-KON
      </span>
      <div className="hk-endnote-bottom">
        <div>
          <HonkonGlyph className="size-7 text-primary" />
          <span>
            Hon-Kon Studio <span className="text-muted-foreground">× AnimeShadow</span>
          </span>
          <LogoGlyph className="size-4 text-muted-foreground" />
        </div>
        <p>Озвучиваем аниме с любовью.</p>
        <StudioShare releases={releases} />
      </div>
    </footer>
  );
}
