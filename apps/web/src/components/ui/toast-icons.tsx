/**
 * Animated marks for notifications, each in its kind's colour: the outline
 * draws itself, then the tick, cross or sign — a tick throws sparks, a cross
 * shakes its head, a warning sways, news gives a little hop. Pure CSS — see
 * .ti-* in index.css.
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
  return tone === "warning" ? (
    <span className="ti ti-warning">
      <svg viewBox="0 0 32 32" aria-hidden>
        <path className="ti-ring" d="M16 4.5 29 27H3z" />
        <path className="ti-tick" d="M16 12.5v6.5M16 23v.5" />
      </svg>
    </span>
  ) : (
    <span className="ti ti-info">
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle className="ti-ring" cx="16" cy="16" r="13" />
        <path className="ti-tick" d="M16 15v7M16 10.5v.5" />
      </svg>
    </span>
  );
}
