import type { AchievementRarity } from "@animeshadow/shared";
import { AwardIcon, CrownIcon, MedalIcon, StarIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface HoloAchievementBadgeProps {
  id: string;
  rarity: AchievementRarity;
  earnedAt?: string | null;
  className?: string;
}

/**
 * A holographic, 3D-tilting achievement badge — pointer position drives a
 * matrix3d tilt plus a rotating rainbow-foil overlay clipped to the badge
 * shape. The tilt/overlay math is intentionally kept close to the reference
 * implementation (it's the fiddly, well-tested part); only the badge's
 * *content* — colours, icon, text — was rebuilt for AnimeShadow's rarity
 * system. One instance is expensive enough (per-pixel mousemove tracking,
 * a live filter) that this belongs on a single showcased badge, not a grid
 * of dozens — see AchievementBadge for the plain version used everywhere else.
 */

const identityMatrix =
  "1, 0, 0, 0, " + "0, 1, 0, 0, " + "0, 0, 1, 0, " + "0, 0, 0, 1";

const maxRotate = 0.25;
const minRotate = -0.25;
const maxScale = 1;
const minScale = 0.97;

const RARITY_ICON: Record<AchievementRarity, typeof AwardIcon> = {
  common: AwardIcon,
  rare: MedalIcon,
  epic: StarIcon,
  legendary: CrownIcon,
};

/** Gradient + text/border colours per rarity — echoes RARITY_MEDAL in profile.tsx. */
const RARITY_STYLE: Record<
  AchievementRarity,
  { from: string; to: string; text: string; border: string; sheen: string[] }
> = {
  common: {
    from: "oklch(0.80 0.02 250)",
    to: "oklch(0.56 0.02 250)",
    text: "oklch(0.22 0.02 250)",
    border: "oklch(0.4 0.02 250 / 0.6)",
    sheen: ["hsl(220 20% 90%)", "hsl(220 10% 60%)", "hsl(220 30% 40%)"],
  },
  rare: {
    from: "oklch(0.83 0.13 230)",
    to: "oklch(0.53 0.17 245)",
    text: "oklch(0.20 0.09 250)",
    border: "oklch(0.35 0.14 245 / 0.7)",
    sheen: ["hsl(200 100% 70%)", "hsl(230 90% 60%)", "hsl(190 90% 55%)"],
  },
  epic: {
    from: "oklch(0.80 0.16 305)",
    to: "oklch(0.48 0.20 295)",
    text: "oklch(0.18 0.13 300)",
    border: "oklch(0.32 0.18 298 / 0.7)",
    sheen: ["hsl(280 90% 70%)", "hsl(320 90% 65%)", "hsl(260 85% 55%)"],
  },
  legendary: {
    from: "oklch(0.91 0.15 95)",
    to: "oklch(0.63 0.17 65)",
    text: "oklch(0.24 0.06 70)",
    border: "oklch(0.4 0.1 70 / 0.7)",
    sheen: ["hsl(45 100% 75%)", "hsl(15 90% 60%)", "hsl(55 95% 65%)"],
  },
};

export function HoloAchievementBadge({
  id,
  rarity,
  earnedAt,
  className,
}: HoloAchievementBadgeProps) {
  const t = useT();
  const labels = useLabels();
  const ref = useRef<HTMLDivElement>(null);
  const [firstOverlayPosition, setFirstOverlayPosition] = useState<number>(0);
  const [matrix, setMatrix] = useState<string>(identityMatrix);
  const [currentMatrix, setCurrentMatrix] = useState<string>(identityMatrix);
  const [disableInOutOverlayAnimation, setDisableInOutOverlayAnimation] =
    useState<boolean>(true);
  const [disableOverlayAnimation, setDisableOverlayAnimation] = useState<boolean>(false);
  const [isTimeoutFinished, setIsTimeoutFinished] = useState<boolean>(false);
  const enterTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeout1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeout2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeout3 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getDimensions = () => {
    const left = ref?.current?.getBoundingClientRect()?.left || 0;
    const right = ref?.current?.getBoundingClientRect()?.right || 0;
    const top = ref?.current?.getBoundingClientRect()?.top || 0;
    const bottom = ref?.current?.getBoundingClientRect()?.bottom || 0;

    return { left, right, top, bottom };
  };

  const getMatrix = (clientX: number, clientY: number) => {
    const { left, right, top, bottom } = getDimensions();
    const xCenter = (left + right) / 2;
    const yCenter = (top + bottom) / 2;

    const scale = [
      maxScale - ((maxScale - minScale) * Math.abs(xCenter - clientX)) / (xCenter - left),
      maxScale - ((maxScale - minScale) * Math.abs(yCenter - clientY)) / (yCenter - top),
      maxScale -
        ((maxScale - minScale) * (Math.abs(xCenter - clientX) + Math.abs(yCenter - clientY))) /
          (xCenter - left + (yCenter - top)),
    ];

    const rotate = {
      x1: 0.25 * ((yCenter - clientY) / yCenter - (xCenter - clientX) / xCenter),
      x2: maxRotate - ((maxRotate - minRotate) * Math.abs(right - clientX)) / (right - left),
      x3: 0,
      y0: 0,
      y2: maxRotate - ((maxRotate - minRotate) * (top - clientY)) / (top - bottom),
      y3: 0,
      z0: -(maxRotate - ((maxRotate - minRotate) * Math.abs(right - clientX)) / (right - left)),
      z1: 0.2 - (0.2 + 0.6) * ((top - clientY) / (top - bottom)),
      z3: 0,
    };
    return (
      `${scale[0]}, ${rotate.y0}, ${rotate.z0}, 0, ` +
      `${rotate.x1}, ${scale[1]}, ${rotate.z1}, 0, ` +
      `${rotate.x2}, ${rotate.y2}, ${scale[2]}, 0, ` +
      `${rotate.x3}, ${rotate.y3}, ${rotate.z3}, 1`
    );
  };

  const getOppositeMatrix = (_matrix: string, clientY: number, onEnter?: boolean) => {
    const { top, bottom } = getDimensions();
    const oppositeY = bottom - clientY + top;
    const weakening = onEnter ? 0.7 : 4;
    const multiplier = onEnter ? -1 : 1;

    return _matrix
      .split(", ")
      .map((item, index) => {
        if (index === 2 || index === 4 || index === 8) {
          return String((-parseFloat(item) * multiplier) / weakening);
        } else if (index === 0 || index === 5 || index === 10) {
          return "1";
        } else if (index === 6) {
          return String(
            (multiplier * (maxRotate - ((maxRotate - minRotate) * (top - oppositeY)) / (top - bottom))) /
              weakening,
          );
        } else if (index === 9) {
          return String(
            (maxRotate - ((maxRotate - minRotate) * (top - oppositeY)) / (top - bottom)) / weakening,
          );
        }
        return item;
      })
      .join(", ");
  };

  const onMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
    if (leaveTimeout1.current) clearTimeout(leaveTimeout1.current);
    if (leaveTimeout2.current) clearTimeout(leaveTimeout2.current);
    if (leaveTimeout3.current) clearTimeout(leaveTimeout3.current);
    setDisableOverlayAnimation(true);

    const { left, right, top, bottom } = getDimensions();
    const xCenter = (left + right) / 2;
    const yCenter = (top + bottom) / 2;

    setDisableInOutOverlayAnimation(false);
    enterTimeout.current = setTimeout(() => setDisableInOutOverlayAnimation(true), 350);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFirstOverlayPosition(
          (Math.abs(xCenter - e.clientX) + Math.abs(yCenter - e.clientY)) / 1.5,
        );
      });
    });

    const nextMatrix = getMatrix(e.clientX, e.clientY);
    const oppositeMatrix = getOppositeMatrix(nextMatrix, e.clientY, true);

    setMatrix(oppositeMatrix);
    setIsTimeoutFinished(false);
    setTimeout(() => setIsTimeoutFinished(true), 200);
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const { left, right, top, bottom } = getDimensions();
    const xCenter = (left + right) / 2;
    const yCenter = (top + bottom) / 2;

    setTimeout(
      () =>
        setFirstOverlayPosition(
          (Math.abs(xCenter - e.clientX) + Math.abs(yCenter - e.clientY)) / 1.5,
        ),
      150,
    );

    if (isTimeoutFinished) {
      setCurrentMatrix(getMatrix(e.clientX, e.clientY));
    }
  };

  const onMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
    const oppositeMatrix = getOppositeMatrix(matrix, e.clientY);

    if (enterTimeout.current) clearTimeout(enterTimeout.current);

    setCurrentMatrix(oppositeMatrix);
    setTimeout(() => setCurrentMatrix(identityMatrix), 200);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDisableInOutOverlayAnimation(false);
        leaveTimeout1.current = setTimeout(
          () => setFirstOverlayPosition(-firstOverlayPosition / 4),
          150,
        );
        leaveTimeout2.current = setTimeout(() => setFirstOverlayPosition(0), 300);
        leaveTimeout3.current = setTimeout(() => {
          setDisableOverlayAnimation(false);
          setDisableInOutOverlayAnimation(true);
        }, 500);
      });
    });
  };

  useEffect(() => {
    if (isTimeoutFinished) setMatrix(currentMatrix);
  }, [currentMatrix, isTimeoutFinished]);

  // Keyframe names are namespaced by id so more than one badge on a page
  // (unlikely today, but cheap to guard) never collides.
  const kf = (n: number) => `holoOverlay-${id}-${n}`;
  const overlayAnimations = [...Array(10).keys()]
    .map(
      (e) => `
    @keyframes ${kf(e + 1)} {
      0% { transform: rotate(${e * 10}deg); }
      50% { transform: rotate(${(e + 1) * 10}deg); }
      100% { transform: rotate(${e * 10}deg); }
    }`,
    )
    .join(" ");

  const style = RARITY_STYLE[rarity];
  const Icon = RARITY_ICON[rarity];
  const title = t(`achievements.items.${id}.title` as "achievements.items.critic.title");
  const rarityLabel = t(`achievements.rarity.${rarity}` as "achievements.rarity.common");
  const gradId = `holo-grad-${id}`;
  const maskId = `holo-mask-${id}`;
  const blurId = `holo-blur-${id}`;
  const sheenHues = [style.sheen[0], style.sheen[1], style.sheen[2], style.sheen[0], style.sheen[1]];

  return (
    <div
      ref={ref}
      title={earnedAt ? t("achievements.earnedOn", { date: labels.formatDate(earnedAt) ?? "" }) : title}
      className={cn("block w-[190px] cursor-pointer select-none", className)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseEnter={onMouseEnter}
    >
      <style>{overlayAnimations}</style>
      <div
        style={{
          transform: `perspective(700px) matrix3d(${matrix})`,
          transformOrigin: "center center",
          transition: "transform 200ms ease-out",
        }}
      >
        <svg viewBox="0 0 260 64" className="h-auto w-full drop-shadow-md">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={style.from} />
              <stop offset="100%" stopColor={style.to} />
            </linearGradient>
            <filter id={blurId}>
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>
            <mask id={maskId}>
              <rect width="260" height="64" fill="white" rx="12" />
            </mask>
          </defs>

          <rect width="260" height="64" rx="12" fill={`url(#${gradId})`} />
          <rect
            x="3"
            y="3"
            width="254"
            height="58"
            rx="10"
            fill="none"
            stroke={style.border}
            strokeWidth="1.5"
          />

          <foreignObject x="10" y="12" width="40" height="40">
            <div
              style={{ color: style.text }}
              className="flex size-full items-center justify-center"
            >
              <Icon className="size-6" strokeWidth={2.25} />
            </div>
          </foreignObject>

          <text
            x="58"
            y="27"
            fontFamily="inherit"
            fontSize="9"
            fontWeight="700"
            letterSpacing="0.08em"
            fill={style.text}
            opacity="0.75"
          >
            {rarityLabel.toUpperCase()}
          </text>
          <text
            x="58"
            y="46"
            fontFamily="inherit"
            fontSize="14"
            fontWeight="800"
            fill={style.text}
          >
            {title.length > 22 ? `${title.slice(0, 21)}…` : title}
          </text>

          {/* Holographic foil — rotating tinted panels blended over the badge,
              clipped to its rounded shape. Purely decorative, aria-hidden. */}
          <g aria-hidden style={{ mixBlendMode: "overlay" }} mask={`url(#${maskId})`}>
            {sheenHues.map((hue, i) => (
              <g
                key={i}
                style={{
                  transform: `rotate(${firstOverlayPosition + i * 20}deg)`,
                  transformOrigin: "center center",
                  transition: !disableInOutOverlayAnimation ? "transform 200ms ease-out" : "none",
                  animation: disableOverlayAnimation ? "none" : `${kf(i + 1)} 6s infinite`,
                  willChange: "transform",
                }}
              >
                <polygon
                  points="0,0 260,64 260,0 0,64"
                  fill={hue}
                  filter={`url(#${blurId})`}
                  opacity="0.5"
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
