import { useState } from "react";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { imageSrc } from "@/lib/format";
import type { StudioVideo } from "./studio-data";

export function StudioVideoPoster({ video }: { video: StudioVideo }) {
  const [attempt, setAttempt] = useState(0);
  const candidates = [
    ...new Set(
      [
        ...(video.youtubeId
          ? [
              `https://i.ytimg.com/vi/${video.youtubeId}/maxresdefault.jpg`,
              `https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`,
            ]
          : []),
        video.image,
      ].filter((url): url is string => Boolean(url)),
    ),
  ];
  const source = candidates[attempt];
  if (!source) return <HonkonGlyph className="size-14 text-primary" />;
  return (
    <img
      key={source}
      src={imageSrc(source)}
      alt=""
      loading="lazy"
      decoding="async"
      width={1280}
      height={720}
      onError={() => setAttempt((n) => n + 1)}
      onLoad={(event) => {
        if (video.youtubeId && event.currentTarget.naturalWidth <= 120)
          setAttempt((n) => n + 1);
      }}
    />
  );
}
