/**
 * Animated marks for notifications: the circle draws itself, then the tick
 * (or cross), then a few sparks fly out. Pure CSS — see .ti-* in index.css.
 */
function Sparks() {
  return (
    <span aria-hidden className="ti-sparks">
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} style={{ "--a": `${i * 60}deg` } as React.CSSProperties} />
      ))}
    </span>
  );
}

export function SuccessMark() {
  return (
    <span className="ti ti-success">
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle className="ti-ring" cx="16" cy="16" r="13" />
        <path className="ti-tick" d="M10 16.5l4 4 8-9" />
      </svg>
      <Sparks />
    </span>
  );
}

export function ErrorMark() {
  return (
    <span className="ti ti-error">
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle className="ti-ring" cx="16" cy="16" r="13" />
        <path className="ti-tick" d="M11.5 11.5l9 9M20.5 11.5l-9 9" />
      </svg>
    </span>
  );
}

export function InfoMark({ tone = "info" }: { tone?: "info" | "warning" }) {
  return (
    <span className={tone === "warning" ? "ti ti-warning" : "ti ti-info"}>
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle className="ti-ring" cx="16" cy="16" r="13" />
        <path className="ti-tick" d="M16 10v8M16 22v.5" />
      </svg>
    </span>
  );
}
