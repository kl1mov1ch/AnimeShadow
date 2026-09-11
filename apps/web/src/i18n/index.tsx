import { DEFAULT_LOCALE, type Locale } from "@animeshadow/shared";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type Dict, en } from "./en";
import { ru } from "./ru";

const DICTS: Record<Locale, Dict> = { en, ru };
const STORAGE_KEY = "animeshadow.locale.v1";

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
  } catch {
    /* storage disabled */
  }
  const lang =
    typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  return lang.startsWith("en") ? "en" : DEFAULT_LOCALE;
}

function lookup(dict: Dict, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      let str = lookup(DICTS[locale], key) ?? lookup(en, key) ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          str = str.split(`{${name}}`).join(String(value));
        }
      }
      return str;
    },
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

const FALLBACK_I18N: I18nValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, vars) => {
    let str = lookup(DICTS[DEFAULT_LOCALE], key) ?? lookup(en, key) ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        str = str.split(`{${name}}`).join(String(value));
      }
    }
    return str;
  },
};

export function useI18n(): I18nValue {
  // Degrade gracefully rather than crash if rendered outside the provider
  // (e.g. inside an error boundary).
  return use(I18nContext) ?? FALLBACK_I18N;
}

export function useT(): TranslateFn {
  return useI18n().t;
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const { locale, setLocale } = useI18n();
  return { locale, setLocale };
}
