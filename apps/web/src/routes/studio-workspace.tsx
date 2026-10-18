import { ArrowUpRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioCatalog } from "@/components/studio/studio-catalog";
import { StudioEndnote, StudioMark } from "@/components/studio/studio-shared";
import { useStudioCatalog } from "@/components/studio/studio-data";
import { useDocumentHead } from "@/lib/seo";
import "@/components/studio/studio.css";
import { Link } from "react-router-dom";
import { StudioShare } from "@/components/studio/studio-share";
import { StudioVideos } from "@/components/studio/studio-videos";
import { StudioAdminTools } from "@/components/studio/studio-admin-tools";
import { useStudioMotion } from "@/components/studio/use-studio-motion";

export function Component() {
  useDocumentHead({
    title: "Все релизы Hon-Kon Studio | AnimeShadow",
    description:
      "Каталог аниме с озвучкой Hon-Kon Studio. Поиск по названию, онгоинги и завершённые истории.",
  });
  const catalog = useStudioCatalog();
  const releases = catalog.data?.releases ?? [];
  const motion = useStudioMotion(
    `${releases.length}:${catalog.data?.index?.videos.length ?? 0}:${catalog.data?.index?.uploads?.length ?? 0}`,
  );
  return (
    <div className="hk-page hk-library" ref={motion}>
      <header className="hk-library-heading">
        <div>
          <h1 className="hk-branded-heading">
            <StudioMark small />
            Релизы Hon-Kon
          </h1>
          <p>Выберите историю в озвучке нашей команды.</p>
          <div className="hk-library-links">
            <Link to="/studio/hon-kon" className="hk-text-link">
              Команда и студия
            </Link>
            <Link to="/browse?dubbingStudio=hon-kon" className="hk-text-link">
              В каталоге
            </Link>
            <Link to="/schedule?studio=hon-kon" className="hk-text-link">
              Календарь
            </Link>
            <StudioShare releases />
          </div>
        </div>
        <Button variant="outline" asChild>
          <a
            href="https://www.hon-kon.ru/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            На сайте студии
            <ArrowUpRightIcon data-icon="inline-end" />
          </a>
        </Button>
      </header>
      <StudioCatalog
        releases={releases}
        loading={catalog.isPending}
        error={catalog.isError}
        retry={() => void catalog.refetch()}
      />
      <StudioVideos
        videos={catalog.data?.index?.uploads ?? []}
        heading="Другие релизы студии"
      />
      <StudioVideos videos={catalog.data?.index?.videos ?? []} />
      <StudioAdminTools />
      <StudioEndnote releases />
    </div>
  );
}
