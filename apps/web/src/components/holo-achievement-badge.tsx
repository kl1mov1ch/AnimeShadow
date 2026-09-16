import type { AchievementRarity } from "@animeshadow/shared";
import { AwardIcon, CrownIcon, LockIcon, MedalIcon, StarIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface HoloAchievementBadgeProps {
  id: string;
  rarity: AchievementRarity;
  earned: boolean;
  earnedAt?: string | null;
  /** Only meaningful when `earned` is false. */
  progress?: { current: number; target: number } | null;
  /** "badge" (wide, with title/rarity text) or "circle" (icon only, small —
   * for the pinned-achievement row under a name). Defaults to "badge". */
  variant?: "badge" | "circle";
  /**
   * False renders the earned look (colour, icon, foil hint) with none of
   * the running cost: no pointer-tracked 3D tilt, no per-instance mousemove
   * listener, no infinite CSS animation on the foil. A picker showing every
   * earned badge at once (there can be dozens) doesn't need all of them
   * animating simultaneously to make the point that they're earned —
   * default true everywhere a badge appears mostly alone.
   */
  animated?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * A badge-shaped achievement card, styled after a holographic award badge.
 * Earned achievements get the full treatment: pointer-tracked 3D tilt (a
 * matrix3d transform) plus a rotating rainbow-foil overlay clipped to the
 * badge shape. Everything not yet earned renders the same shape flat and
 * grey, with no tilt/animation at all — both because "locked" shouldn't
 * look like a reward, and because a grid can hold dozens of these; only the
 * ones actually worth showing off pay for the live pointer tracking and
 * SVG filter.
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

/** Gradient + text/border colours per rarity — the only thing that changes per tier. */
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

/** Flat, colourless — every rarity looks the same until it's earned. */
const LOCKED_STYLE = {
  from: "oklch(0.34 0 0)",
  to: "oklch(0.24 0 0)",
  text: "oklch(0.7 0 0)",
  border: "oklch(0.4 0 0 / 0.5)",
};

export function HoloAchievementBadge({
  id,
  rarity,
  earned,
  earnedAt,
  progress,
  variant = "badge",
  animated = true,
  onClick,
  className,
}: HoloAchievementBadgeProps) {
  const t = useT();
  const labels = useLabels();
  const isCircle = variant === "circle";
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

  const Icon = earned ? RARITY_ICON[rarity] : LockIcon;
  const title = t(`achievements.items.${id}.title` as "achievements.items.critic.title");
  const rarityLabel = t(`achievements.rarity.${rarity}` as "achievements.rarity.common");
  const percent =
    !earned && progress ? Math.round((progress.current / progress.target) * 100) : null;
  const gradId = `holo-grad-${id}-${variant}`;
  const maskId = `holo-mask-${id}-${variant}`;
  const blurId = `holo-blur-${id}-${variant}`;

  const shortTitle = title.length > 22 ? `${title.slice(0, 21)}…` : title;
  const tooltip = earnedAt
    ? t("achievements.earnedOn", { date: labels.formatDate(earnedAt) ?? "" })
    : percent != null
      ? `${title} — ${percent}%`
      : title;

  const viewBox = isCircle ? "0 0 64 64" : "0 0 260 64";
  const polygonPoints = isCircle ? "0,0 64,64 64,0 0,64" : "0,0 260,64 260,0 0,64";
  const defaultSize = isCircle ? "size-14" : "w-[220px]";
  const rootClassName = cn(
    "block select-none",
    defaultSize,
    onClick && "cursor-pointer",
    className,
  );

  const shape = (fill: string, stroke?: string) =>
    isCircle ? (
      <>
        <circle cx="32" cy="32" r="31" fill={fill} />
        {stroke && <circle cx="32" cy="32" r="29.5" fill="none" stroke={stroke} strokeWidth="1.5" />}
      </>
    ) : (
      <>
        <rect width="260" height="64" rx="12" fill={fill} />
        {stroke && (
          <rect x="3" y="3" width="254" height="58" rx="10" fill="none" stroke={stroke} strokeWidth="1.5" />
        )}
      </>
    );

  const maskShape = isCircle ? (
    <circle cx="32" cy="32" r="32" fill="white" />
  ) : (
    <rect width="260" height="64" fill="white" rx="12" />
  );

  const iconBox = isCircle ? { x: 14, y: 14, size: 36 } : { x: 10, y: 12, size: 40 };

  // Locked/in-progress: the same shape, flat and still — no tilt, no foil,
  // no per-instance mousemove listeners. Cheap enough for a whole grid of them.
  if (!earned) {
    return (
      <div
        title={tooltip}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
        className={rootClassName}
      >
        <svg viewBox={viewBox} className="h-auto w-full opacity-80">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={LOCKED_STYLE.from} />
              <stop offset="100%" stopColor={LOCKED_STYLE.to} />
            </linearGradient>
          </defs>
          {shape(`url(#${gradId})`, LOCKED_STYLE.border)}
          <foreignObject x={iconBox.x} y={iconBox.y} width={iconBox.size} height={iconBox.size}>
            <div
              style={{ color: LOCKED_STYLE.text }}
              className="flex size-full items-center justify-center"
            >
              <Icon className={isCircle ? "size-5" : "size-6"} strokeWidth={2.25} />
            </div>
          </foreignObject>
          {!isCircle && (
            <>
              <text
                x="58"
                y="27"
                fontSize="9"
                fontWeight="700"
                letterSpacing="0.08em"
                fill={LOCKED_STYLE.text}
                opacity="0.75"
              >
                {percent != null ? `${percent}%` : rarityLabel.toUpperCase()}
              </text>
              <text x="58" y="46" fontSize="14" fontWeight="800" fill={LOCKED_STYLE.text}>
                {shortTitle}
              </text>
            </>
          )}
        </svg>
      </div>
    );
  }

  const style = RARITY_STYLE[rarity];
  const sheenHues = [style.sheen[0], style.sheen[1], style.sheen[2], style.sheen[0], style.sheen[1]];
  // Keyframe names are namespaced by id+variant so more than one badge on a
  // page (the grid, the pinned circles, the dialog) never collides.
  const kf = (n: number) => `holoOverlay-${id}-${variant}-${n}`;
  const overlayAnimations = animated
    ? [...Array(10).keys()]
        .map(
          (e) => `
    @keyframes ${kf(e + 1)} {
      0% { transform: rotate(${e * 10}deg); }
      50% { transform: rotate(${(e + 1) * 10}deg); }
      100% { transform: rotate(${e * 10}deg); }
    }`,
        )
        .join(" ")
    : "";

  return (
    <div
      ref={ref}
      title={tooltip}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={rootClassName}
      onMouseMove={animated ? onMouseMove : undefined}
      onMouseLeave={animated ? onMouseLeave : undefined}
      onMouseEnter={animated ? onMouseEnter : undefined}
    >
      {animated && <style>{overlayAnimations}</style>}
      <div
        style={{
          transform: animated ? `perspective(700px) matrix3d(${matrix})` : undefined,
          transformOrigin: "center center",
          transition: animated ? "transform 200ms ease-out" : undefined,
        }}
      >
        <svg viewBox={viewBox} className="h-auto w-full drop-shadow-md">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={style.from} />
              <stop offset="100%" stopColor={style.to} />
            </linearGradient>
            {animated && (
              <filter id={blurId}>
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
              </filter>
            )}
            <mask id={maskId}>{maskShape}</mask>
          </defs>

          {shape(`url(#${gradId})`, style.border)}

          <foreignObject x={iconBox.x} y={iconBox.y} width={iconBox.size} height={iconBox.size}>
            <div
              style={{ color: style.text }}
              className="flex size-full items-center justify-center"
            >
              <Icon className={isCircle ? "size-5" : "size-6"} strokeWidth={2.25} />
            </div>
          </foreignObject>

          {!isCircle && (
            <>
              <text
                x="58"
                y="27"
                fontSize="9"
                fontWeight="700"
                letterSpacing="0.08em"
                fill={style.text}
                opacity="0.75"
              >
                {rarityLabel.toUpperCase()}
              </text>
              <text x="58" y="46" fontSize="14" fontWeight="800" fill={style.text}>
                {shortTitle}
              </text>
            </>
          )}

          {/* Holographic foil — rotating tinted panels blended over the badge,
              clipped to its shape. Purely decorative, aria-hidden. Static
              mode keeps one unblurred, unanimated panel: enough to read as
              "this one has foil" without the per-frame blur+rotate cost of
              five animating panels times however many badges are on screen. */}
          <g aria-hidden style={{ mixBlendMode: "overlay" }} mask={`url(#${maskId})`}>
            {(animated ? sheenHues : sheenHues.slice(0, 1)).map((hue, i) => (
              <g
                key={i}
                style={
                  animated
                    ? {
                        transform: `rotate(${firstOverlayPosition + i * 20}deg)`,
                        transformOrigin: "center center",
                        transition: !disableInOutOverlayAnimation
                          ? "transform 200ms ease-out"
                          : "none",
                        animation: disableOverlayAnimation ? "none" : `${kf(i + 1)} 6s infinite`,
                        willChange: "transform",
                      }
                    : { transform: "rotate(20deg)", transformOrigin: "center center" }
                }
              >
                <polygon
                  points={polygonPoints}
                  fill={hue}
                  filter={animated ? `url(#${blurId})` : undefined}
                  opacity={animated ? 0.5 : 0.25}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
