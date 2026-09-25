import type { LibraryImportInput, MyProfile, ProfilePrivacy, Visibility } from "@animeshadow/shared";
import {
  DownloadIcon,
  LockIcon,
  PaletteIcon,
  RotateCcwIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { apiDownload } from "@/lib/api";
import { useImportLibrary, useUpdateProfile } from "@/lib/query";
import { cn } from "@/lib/utils";

/* ---------------- search over settings ---------------- */

const SearchContext = createContext<{ query: string; setQuery: (q: string) => void }>({
  query: "",
  setQuery: () => undefined,
});

export function SettingsSearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}

/** Whether a setting with this label should show for the current search. */
export function useSettingsMatch(label: string): boolean {
  const { query } = useContext(SearchContext);
  const q = query.trim().toLowerCase();
  return !q || label.toLowerCase().includes(q);
}

/**
 * One field that filters every setting by its name, so "тема" or "язык"
 * finds the row instead of the viewer scanning a long dialog for it.
 */
export function SettingsSearchBox() {
  const t = useT();
  const { query, setQuery } = useContext(SearchContext);
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary/70" />
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("profile.settingsSearch")}
        className="h-10 w-full rounded-lg border border-primary/25 bg-primary/5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label={t("common.clear")}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-primary"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------------- the new sections ---------------- */

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof LockIcon;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const matches = useSettingsMatch(`${title} ${hint}`);
  if (!matches) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-4" />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </span>
      </div>
      {children}
    </section>
  );
}

const SWATCHES = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

/** The profile's own colour: a swatch, any colour, or the site's. */
export function AccentSection({ profile }: { profile: MyProfile }) {
  const t = useT();
  const update = useUpdateProfile();
  return (
    <Section icon={PaletteIcon} title={t("profile.accent.title")} hint={t("profile.accent.hint")}>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => update.mutate({ accentColor: color })}
            aria-label={color}
            aria-pressed={profile.accentColor === color}
            style={{ background: color }}
            className={cn(
              "size-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95",
              profile.accentColor === color ? "border-foreground ring-2 ring-offset-2 ring-offset-background" : "border-transparent",
            )}
          />
        ))}
        <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-primary/40 text-primary">
          <PaletteIcon className="size-4" />
          <input
            type="color"
            value={profile.accentColor ?? "#e11d48"}
            onChange={(e) => update.mutate({ accentColor: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => update.mutate({ accentColor: null })}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
          {t("profile.accent.reset")}
        </button>
      </div>
    </Section>
  );
}

/** Who sees each part of the profile. */
export function PrivacySection({ profile }: { profile: MyProfile }) {
  const t = useT();
  const update = useUpdateProfile();
  const setPrivacy = (part: keyof ProfilePrivacy, value: Visibility) =>
    update.mutate(
      { privacy: { ...profile.privacy, [part]: value } },
      { onSuccess: () => toast.success(t("profile.blocks.saved")) },
    );
  const parts: Array<keyof ProfilePrivacy> = ["list", "stats", "activity", "watching"];
  const levels: Visibility[] = ["public", "users", "private"];

  return (
    <Section icon={LockIcon} title={t("profile.privacy.title")} hint={t("profile.privacy.hint")}>
      <div className="flex flex-col gap-2">
        {parts.map((part) => (
          <div key={part} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{t(`profile.privacy.${part}` as "profile.privacy.list")}</span>
            <div className="flex rounded-lg border border-primary/25 bg-primary/5 p-0.5">
              {levels.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPrivacy(part, level)}
                  aria-pressed={profile.privacy[part] === level}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                    profile.privacy[part] === level
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-primary",
                  )}
                >
                  {t(`profile.privacy.${level}` as "profile.privacy.public")}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Download the list, or bring one in. */
export function PortabilitySection() {
  const t = useT();
  const importer = useImportLibrary();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [format, setFormat] = useState<LibraryImportInput["format"]>("mal");

  const upload = async (file: File) => {
    try {
      const content = await file.text();
      toast.promise(importer.mutateAsync({ format, content }), {
        loading: t("profile.portability.importing"),
        success: (r) => t("profile.portability.imported", r),
        error: () => t("profile.portability.failed"),
      });
    } catch {
      toast.error(t("profile.portability.failed"));
    }
  };

  return (
    <Section icon={UploadIcon} title={t("profile.portability.title")} hint={t("profile.portability.hint")}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void apiDownload("/me/library/export?format=json", "animeshadow-list.json")}
          className="btn-sheen inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <DownloadIcon className="size-3.5" />
          {t("profile.portability.exportJson")}
        </button>
        <button
          type="button"
          onClick={() => void apiDownload("/me/library/export?format=mal", "animelist.xml")}
          className="btn-sheen inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
        >
          <DownloadIcon className="size-3.5" />
          {t("profile.portability.exportMal")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as LibraryImportInput["format"])}
          aria-label={t("profile.portability.importAs")}
          className="h-8 rounded-lg border border-primary/25 bg-card/70 px-2 text-xs outline-none focus:border-primary"
        >
          <option value="mal">{t("profile.portability.formatMal")}</option>
          <option value="shikimori">{t("profile.portability.formatShikimori")}</option>
          <option value="animeshadow">{t("profile.portability.formatOwn")}</option>
        </select>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importer.isPending}
          className="btn-sheen inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 disabled:opacity-60"
        >
          <UploadIcon className="size-3.5" />
          {t("profile.portability.import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.json,application/json,text/xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
    </Section>
  );
}

/** Shown under a search, so an empty result says so instead of looking broken. */
export function NothingFound() {
  const t = useT();
  return <p className="text-center text-[11px] text-muted-foreground">{t("profile.settingsNothing")}</p>;
}
