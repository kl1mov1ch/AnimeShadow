import { ArrowRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogoGlyph } from "@/components/brand/logo-glyph";
import { cn } from "@/lib/utils";

/**
 * The new homepage's own little design system: one dark, cinematic surface
 * set with a single crimson accent. Kept here rather than in the app's
 * shared UI so nothing outside this page changes colour.
 *
 *   page      #03070C   sections alternate with #050A10
 *   cards     #0A1018 / #0C131C
 *   accent    #FF174F
 *   text      #F5F5F7   secondary #8D96A3   borders white/8
 */

export const HOME_BG = "bg-[var(--hm-bg)]";
export const HOME_BG_ALT = "bg-[var(--hm-bg-alt)]";
export const HOME_CARD = "bg-[var(--hm-card)]";
export const HOME_CARD_ALT = "bg-[var(--hm-card-alt)]";
export const HOME_BORDER = "border-[var(--hm-border)]";
export const HOME_TEXT = "text-[var(--hm-text)]";
export const HOME_MUTED = "text-[var(--hm-muted)]";
export const ACCENT = "#FF174F";

/** Every section lines its content up on the same 1200px column. */
export function HomeContainer({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6", className)}>{children}</div>;
}

/**
 * The section heading from the mock: a small slashed label, the title, a
 * subtitle under it, and an optional link off to the right.
 */
export function SectionHeading({
  label,
  title,
  subtitle,
  action,
}: {
  label: string;
  title: string;
  subtitle?: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--hm-muted)]">
          <span aria-hidden className="inline-block h-3.5 w-[3px] skew-x-[-12deg] bg-[var(--hm-accent)]" />
          {label}
        </p>
        <h2 className="home-display mt-2 text-2xl leading-tight text-[var(--hm-text)] sm:text-[28px]">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-[var(--hm-muted)]">{subtitle}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm text-[var(--hm-muted)] transition-colors hover:text-[var(--hm-accent)]"
        >
          {action.label}
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * Where a picture will go. Holds its aspect ratio and fills it with a dark
 * red wash, so swapping in the real artwork later changes nothing about the
 * layout: give it `src` and it renders the image instead.
 */
export function ArtPlaceholder({
  src,
  ratio = "16 / 9",
  className,
  overlay = true,
  children,
}: {
  src?: string | null;
  /** CSS aspect-ratio of the final image. */
  ratio?: string;
  className?: string;
  /** The dark vignette that keeps text over the art readable. */
  overlay?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      style={{ aspectRatio: ratio }}
      className={cn("relative w-full overflow-hidden bg-[var(--hm-card)]", className)}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ filter: "brightness(var(--hm-art-brightness))" }}
        />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 78% 22%, rgba(255,23,79,0.45), transparent 62%), radial-gradient(90% 70% at 20% 90%, rgba(120,20,60,0.35), transparent 65%), linear-gradient(160deg, #10060C 0%, #070A11 60%, #03070C 100%)",
            }}
          />
          {/* A faint diagonal weave, so an empty frame still has texture. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 9px)",
            }}
          />
        </>
      )}
      {overlay && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(3,7,12,0.92) 0%, rgba(3,7,12,0.35) 45%, transparent 100%)",
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The page's button. Every one of them catches the same band of white light
 * on hover — it sweeps across the face left to right — and presses in when
 * clicked. Three weights: filled, outlined, bare.
 */
export function HomeButton({
  to,
  href,
  variant = "accent",
  className,
  children,
  onClick,
  type,
}: {
  to?: string;
  href?: string;
  variant?: "accent" | "outline" | "ghost";
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const classes = cn(
    "group/btn relative isolate inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-lg px-5 text-sm font-semibold transition-all duration-300 active:scale-[0.97]",
    variant === "accent" &&
      "bg-[var(--hm-accent)] text-white hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-14px_var(--hm-accent)]",
    variant === "outline" &&
      "border border-[var(--hm-border-strong)] bg-transparent text-[var(--hm-text)] hover:-translate-y-0.5 hover:border-[var(--hm-accent)]",
    variant === "ghost" && "text-[var(--hm-muted)] hover:text-[var(--hm-text)]",
    className,
  );
  const body = (
    <>
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      <Shine />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {body}
      </a>
    );
  }
  return (
    <button type={type ?? "button"} onClick={onClick} className={classes}>
      {body}
    </button>
  );
}

/**
 * The band of light. Parked off the left edge, it crosses the element when
 * the group it belongs to is hovered. Add it to anything that should catch
 * the same light as the buttons.
 */
export function Shine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 z-0 w-1/3 -translate-x-[250%] -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover/btn:translate-x-[400%] group-hover/card:translate-x-[400%] motion-reduce:hidden",
        className,
      )}
    />
  );
}

/** A small pill used for badges over artwork ("Хит", "4K", "Финал"). */
export function HomeBadge({
  tone = "accent",
  className,
  children,
}: {
  tone?: "accent" | "dark";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "accent" ? "bg-[var(--hm-accent)] text-white" : "bg-black/70 text-[var(--hm-text)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Plays its children in when they first scroll into view, and never again.
 * One observer per block, disconnected the moment it fires, so a long page
 * of these costs nothing to scroll past.
 */
export function Reveal({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  /** Milliseconds after the block appears, for staggering a row. */
  delay?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-6 opacity-0 blur-[2px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Counts up to `target` once `active` turns true — the numbers land rather
 * than simply being there. Respects "reduce motion" by jumping straight to
 * the value.
 */
export function useCountUp(target: number, active: boolean, durationMs = 1400): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic: fast at first, settling at the end.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);

  return value;
}

/**
 * The site's mark, huge and faint, behind a section — what gives the page
 * its weight. Decorative only.
 */
export function GlyphWatermark({ className }: { className?: string }) {
  return (
    <LogoGlyph
      className={cn("pointer-events-none absolute select-none text-[var(--hm-text)]/[0.035]", className)}
    />
  );
}
