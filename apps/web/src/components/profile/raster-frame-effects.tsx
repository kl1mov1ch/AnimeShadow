import "./raster-frame-effects.css";

export type RasterFramePack =
  | "culling"
  | "hells-paradise"
  | "dorohedoro"
  | "atelier"
  | "reze"
  | "solo-jinwoo"
  | "solo-beru"
  | "sylphie"
  | "eris"
  | "roxy"
  | "gojo"
  | "hunter"
  | "akame";
const effectClass = "frame-raster-effect shadow-avatar-frame__animated";

/** Independent painted alpha layers; transforms/opacity are the only animated properties. */
export function RasterFrameEffects({ pack }: { pack: RasterFramePack }) {
  const source = (name: string) => `/frames/packs/${pack}/${name}.webp`;
  return (
    <span className="frame-raster-effects" data-pack={pack} aria-hidden>
      {[
        "solo-jinwoo",
        "solo-beru",
        "sylphie",
        "eris",
        "roxy",
        "gojo",
        "hunter",
        "akame",
      ].includes(pack) && (
        <img
          className={`${effectClass} frame-raster-veil`}
          src={source("veil")}
          alt=""
        />
      )}
      {pack === "culling" && (
        <>
          <img
            className={`${effectClass} frame-raster-runes`}
            src={source("runes")}
            alt=""
          />
          <img
            className={`${effectClass} frame-raster-glitch`}
            src={source("glitch")}
            alt=""
          />
        </>
      )}
      {pack === "hells-paradise" &&
        Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={`${effectClass} frame-raster-orbit frame-raster-petal-orbit`}
            style={{ animationDelay: `${i * -2.6}s` }}
          >
            <img
              className={`${effectClass} frame-raster-petal`}
              src={source("petals")}
              alt=""
              style={{ animationDelay: `${i * -0.4}s` }}
            />
          </span>
        ))}
      {pack === "dorohedoro" &&
        [8, 22, 69, 82, 46].map((left, i) => (
          <img
            key={left}
            className={`${effectClass} frame-raster-smoke`}
            src={source("smoke")}
            alt=""
            style={{
              left: `${left}%`,
              animationDelay: `${[0, -1.7, -3.4, -2.8, -4.1][i]}s`,
            }}
          />
        ))}
      {pack === "atelier" && (
        <>
          <img
            className={`${effectClass} frame-raster-glow`}
            src={source("glow")}
            alt=""
          />
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`${effectClass} frame-raster-orbit frame-raster-spark-orbit`}
              style={{ animationDelay: `${i * -4}s` }}
            >
              <img
                className={`${effectClass} frame-raster-spark`}
                src={source("sparks")}
                alt=""
                style={{ animationDelay: `${i * -0.35}s` }}
              />
            </span>
          ))}
        </>
      )}
      {pack === "reze" && (
        <>
          <img
            className={`${effectClass} frame-raster-rainbow`}
            src={source("rainbow")}
            alt=""
          />
          <img
            className={`${effectClass} frame-raster-pulse`}
            src={source("pulse")}
            alt=""
          />
        </>
      )}
    </span>
  );
}
