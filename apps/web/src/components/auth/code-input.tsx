import { type ClipboardEvent, type KeyboardEvent, useRef, useState } from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

const LENGTH = 6;

/**
 * Six individual digit boxes instead of one plain text field — matches the
 * boxed-digit layout the email itself shows, and paste (the whole code
 * copied at once) fills every box in one go rather than requiring six
 * separate keystrokes.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fires once, the moment the 6th digit lands — the natural "submit" cue. */
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [focused, setFocused] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(LENGTH, " ").split("").slice(0, LENGTH);

  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/[^0-9]/g, "").slice(-1);
    const next = value.split("");
    next[index] = digit || "";
    const joined = next.join("").slice(0, LENGTH).replace(/\s+$/, "");
    onChange(joined);
    if (digit && index < LENGTH - 1) refs.current[index + 1]?.focus();
    if (joined.length === LENGTH) onComplete?.(joined);
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < LENGTH - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    if (pasted.length === LENGTH) {
      refs.current[LENGTH - 1]?.focus();
      onComplete?.(pasted);
    } else {
      refs.current[pasted.length]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-center gap-2" role="group" aria-label={t("auth.verifyEmail.codeLabel")}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit.trim()}
            disabled={disabled}
            onChange={(e) => setDigit(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onPaste={onPaste}
            onFocus={(e) => {
              setFocused(index);
              e.target.select();
            }}
            onBlur={() => setFocused(null)}
            aria-invalid={error ? true : undefined}
            className={cn(
              "size-11 rounded-lg border bg-background text-center font-display text-lg font-semibold outline-none transition-colors sm:size-12",
              error
                ? "border-destructive"
                : focused === index
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-input",
            )}
          />
        ))}
      </div>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
