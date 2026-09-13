import { CheckIcon } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type Score = 0 | 1 | 2 | 3 | 4;
type Rule = "length" | "mixedCase" | "digit" | "symbol";

const COMMON_FRAGMENTS = [
  "password",
  "qwerty",
  "123456",
  "111111",
  "iloveyou",
  "admin",
  "letmein",
  "anime",
  "naruto",
  "пароль",
  "йцукен",
];

const SEQUENCES = /0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv/i;

/** A quick, dependency-free estimate — not a security guarantee, just enough
 * to nudge people away from the obvious (short, one character class, a
 * dictionary word, "1234"). The server still enforces the real minimum. */
export function scorePassword(password: string): { score: Score; rules: Record<Rule, boolean> } {
  const rules: Record<Rule, boolean> = {
    length: password.length >= 8,
    mixedCase: /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password),
    digit: /\d/.test(password),
    symbol: /[^\p{L}\p{N}]/u.test(password),
  };
  if (!password) return { score: 0, rules };

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (rules.mixedCase) points += 1;
  if (rules.digit) points += 1;
  if (rules.symbol) points += 1;

  const lower = password.toLowerCase();
  if (COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment))) points -= 2;
  if (/(.)\1{2,}/u.test(password)) points -= 1;
  if (SEQUENCES.test(password)) points -= 1;

  if (password.length < 8 || points <= 2) return { score: 1, rules };
  if (points === 3) return { score: 2, rules };
  if (points === 4) return { score: 3, rules };
  return { score: 4, rules };
}

const LEVELS: Record<Score, { key: string; bar: string; text: string; face: string }> = {
  0: { key: "weak", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", face: "(・_・)" },
  1: { key: "weak", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", face: "(╥﹏╥)" },
  2: { key: "fair", bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", face: "(・_・;)" },
  3: { key: "good", bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", face: "(￣▽￣)ノ" },
  4: {
    key: "strong",
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    face: "٩(ˊᗜˋ*)و ✧",
  },
};

const RULES: Rule[] = ["length", "mixedCase", "digit", "symbol"];

/** Live strength meter under a password field: four segments that fill as
 * the password improves, a checklist, and a small reaction that changes
 * with each level. Collapses to nothing while the field is empty. */
export function PasswordStrength({ password }: { password: string }) {
  const t = useT();
  const { score, rules } = scorePassword(password);
  const level = LEVELS[score];
  const visible = password.length > 0;

  return (
    <div
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((segment) => (
              <span key={segment} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "block h-full origin-left rounded-full transition-[transform,background-color] duration-500 ease-out",
                    level.bar,
                  )}
                  style={{
                    transform: `scaleX(${score >= segment ? 1 : 0})`,
                    transitionDelay: `${(segment - 1) * 60}ms`,
                  }}
                />
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={cn("font-medium transition-colors", level.text)}>
              {t(`auth.strength.${level.key}`)}
            </span>
            <span
              key={level.face}
              aria-hidden
              className="animate-in fade-in zoom-in-75 font-medium text-muted-foreground duration-300"
            >
              {level.face}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {RULES.map((rule) => (
              <li
                key={rule}
                className={cn(
                  "flex items-center gap-1.5 transition-colors",
                  rules[rule] ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                    rules[rule] ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                  )}
                >
                  {rules[rule] && (
                    <CheckIcon className="size-2.5 animate-in zoom-in-50 duration-200" strokeWidth={3.5} />
                  )}
                </span>
                {t(`auth.strength.rules.${rule}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
