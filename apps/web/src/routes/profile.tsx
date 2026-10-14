import type {
  MyProfile,
} from "@animeshadow/shared";
import { apiRequest } from "@/lib/api";
import { getVisitorId } from "@/lib/visitor";

import { useEffect, useState } from "react";
import {
  ChevronRightIcon,
  type LucideIcon,
  MailIcon,
  MonitorSmartphoneIcon,
  MoonStarIcon,
  SunIcon,
  PaletteIcon,
  ShieldCheckIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/common/states";

import { PasswordInput, TextInput } from "@/components/auth/auth-card";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";

import { useLabels } from "@/lib/labels";
import {
  useDeleteAccount,
  useGenrePreferencesStatus,
  useGenres,
  useMyProfile,
  usePublicProfile,
  useReactionGif,
  useResendVerification,
  useSetGenrePreferences,
  useUpdateProfile,
  useVerifyEmail,
} from "@/lib/query";
import { cn } from "@/lib/utils";

import { useSettingsMatch } from "@/components/profile/profile-settings-extras";
import { ProfileStudio } from "@/components/profile/profile-studio";
import { ProfileView } from "@/components/profile/page/profile-view";
import { FEATURES } from "@/lib/features";
import type { StudioTab } from "@/components/profile/profile-studio";

export function Component() {
  const t = useT();
  const { username } = useParams();
  const { status } = useAuth();

  if (username) return <PublicView username={username.replace(/^@/, "")} />;

  if (status === "loading") return <ProfileSkeleton />;
  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-[1400px] py-10">
        <EmptyState
          title={t("profile.signedOut.title")}
          description={t("profile.signedOut.body")}
          action={
            <Button asChild>
              <Link to="/login">{t("profile.signedOut.cta")}</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <OwnView />;
}

function PublicView({ username }: { username: string }) {
  const t = useT();
  const { user } = useAuth();
  const { data, isPending, isError } = usePublicProfile(username);
  const viewed = data && (!user || data.id !== user.id) ? data.id : null;
  useEffect(() => {
    if (!viewed) return;
    // Once per open page; the server counts each person once a day.
    void apiRequest(`/users/${viewed}/view`, { method: "POST", body: { visitorId: getVisitorId() } }).catch(() => undefined);
  }, [viewed]);
  if (isPending) return <ProfileSkeleton />;
  if (isError || !data)
    return <ErrorState title={t("errors.notFoundTitle")} message={t("errors.notFoundBody")} />;
  // One's own profile opened by its public address is still one's own page.
  if (user && data.id === user.id) return <OwnView />;
  return <ProfileView profile={data} own={false} />;
}

const STUDIO_TABS: StudioTab[] = ["profile", "look", "showcase", "taste", "privacy", "notify", "list", "account"];

function OwnView() {
  const t = useT();
  const { data: profile, isPending } = useMyProfile();
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<StudioTab>("profile");
  const [params, setParams] = useSearchParams();
  const asked = params.get("studio");
  useEffect(() => {
    if (!asked || !profile) return;
    setStudioTab(STUDIO_TABS.find((tab) => tab === asked) ?? "profile");
    setStudioOpen(true);
    const next = new URLSearchParams(params);
    next.delete("studio");
    setParams(next, { replace: true, preventScrollReset: true });
  }, [asked, profile, params, setParams]);
  if (isPending || !profile) return <ProfileSkeleton />;
  const openStudio = (tab: StudioTab = "profile") => {
    setStudioTab(tab);
    setStudioOpen(true);
  };
  return (
    <>
      <ProfileView profile={profile} own onCustomise={openStudio} />
      <ProfileStudio
        profile={profile}
        open={studioOpen}
        onOpenChange={setStudioOpen}
        initialTab={studioTab}
        account={<SettingsTab profile={profile} />}
        taste={
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{t("profile.settings.genresHint")}</p>
            <GenrePreferencesSection />
          </div>
        }
      />
    </>
  );
}

/** One rounded list, hairline dividers between rows — the Telegram settings-
 * screen shape: a single continuous surface instead of a stack of separate
 * bordered cards each with their own heading and padding. */
function SettingsList({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
      {children}
    </div>
  );
}

/**
 * One row. Two shapes, matching how Telegram itself splits its own settings:
 * - `control` — a value that's already a single-tap picker (a two/three-way
 *   Select) sits inline as the row's trailing content, no extra tap needed.
 * - `children` — anything bigger (text fields, a picker grid, a form) stays
 *   collapsed behind the row and only takes up space once it's opened; the
 *   summary value (if any) is what's visible either way.
 */
function SettingsRow({
  icon: Icon,
  label,
  value,
  info,
  control,
  expanded,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value?: React.ReactNode;
  info?: React.ReactNode;
  control?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const matches = useSettingsMatch(label);
  if (!matches) return null;
  const header = (
    <div
      className={cn(
        "group/row flex min-h-14 items-center gap-3 px-4 py-2.5",
        onToggle && "cursor-pointer transition-colors hover:bg-secondary/40 active:bg-secondary/60",
      )}
      onClick={onToggle}
      role={onToggle ? "button" : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onKeyDown={onToggle ? (e) => e.key === "Enter" && onToggle() : undefined}
    >
      {/* One treatment for every row, not a hue per row. Eight different
          colours down a single list made the list itself the loudest thing
          on the page, and implied a grouping that does not exist — these
          rows are siblings, not categories. The chip stays neutral and only
          takes the site colour once its row is open or hovered, so colour
          means state here rather than decoration. */}
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-secondary/40 text-muted-foreground transition-colors duration-200",
          onToggle && "group-hover/row:border-primary/30 group-hover/row:text-foreground",
          expanded && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium">
        {label}
        {info}
      </span>
      {control ?? (
        <>
          {value && (
            <span className="min-w-0 max-w-[45%] truncate text-xs text-muted-foreground">
              {value}
            </span>
          )}
          {onToggle && (
            <ChevronRightIcon
              className={cn(
                "size-4 shrink-0 text-muted-foreground/50 transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      {header}
      {/* Opens with a fade and a small rise rather than appearing outright.
          Still conditionally mounted: keeping a collapsed form in the DOM
          just to animate its height would leave its inputs reachable by
          keyboard while invisible, which is a worse bug than an instant
          close. */}
      {expanded && children && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 px-4 pb-4 pt-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The account part of the profile studio: theme (where there is a choice),
 * the age check, the email, and deleting the account. The profile's face —
 * avatar, nickname, description, status — and the showcase have their own
 * sections in the studio.
 */
function SettingsTab({ profile }: { profile: MyProfile }) {
  const t = useT();
  const { setTheme, theme } = useTheme();
  const update = useUpdateProfile();
  // One row open at a time, accordion-style.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (key: string) => setOpenRow((cur) => (cur === key ? null : key));

  return (
    <div className="flex flex-col gap-5">
      <SettingsList>
        {FEATURES.lightTheme && (
        <SettingsRow
          icon={PaletteIcon}
          label={t("profile.settings.theme")}
          value={t(
            theme === "light"
              ? "profile.settings.themeLight"
              : theme === "dark"
                ? "profile.settings.themeDark"
                : "profile.settings.themeAuto",
          )}
          expanded={openRow === "theme"}
          onToggle={() => toggle("theme")}
        >
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "light", Icon: SunIcon, label: t("profile.settings.themeLight") },
                { key: "dark", Icon: MoonStarIcon, label: t("profile.settings.themeDark") },
                {
                  key: "system",
                  Icon: MonitorSmartphoneIcon,
                  label: t("profile.settings.themeAuto"),
                },
              ] as const
            ).map(({ key, Icon, label }) => {
              const active = (theme ?? "system") === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTheme(key);
                    // Saved to the account, not just this browser — so it
                    // follows the user to a new device (see ThemeSync).
                    update.mutate({ theme: key });
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200",
                    active
                      ? "border-transparent bg-gradient-to-br from-primary via-primary/85 to-primary text-primary-foreground shadow-md"
                      : "border-border/60 bg-card/40 text-muted-foreground hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="relative z-10 size-5" />
                  <span className="relative z-10 truncate">{label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[200%] -skew-x-12 bg-gradient-to-r from-transparent to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]",
                      active ? "via-white/30" : "via-primary/25",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </SettingsRow>
        )}
        <SettingsRow
          icon={ShieldCheckIcon}
          label={t("profile.settings.age.title")}
          value={
            profile.birthDate
              ? profile.isAdult
                ? t("profile.settings.age.verifiedAdult")
                : t("profile.settings.age.verifiedMinor")
              : t("profile.settings.age.notSet")
          }
          expanded={openRow === "age"}
          onToggle={profile.birthDate ? undefined : () => toggle("age")}
        >
          <AgeVerificationContent profile={profile} update={update} />
        </SettingsRow>
        <EmailVerificationRow
          expanded={openRow === "email"}
          onToggle={() => toggle("email")}
        />
      </SettingsList>

      <DeleteAccountSection profile={profile} />
    </div>
  );
}

/**
 * Only for accounts created before signup itself required a code — every
 * newer account is verified the moment it exists. Telegram accounts have no
 * inbox behind them, so they never see this.
 */
function EmailVerificationRow({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { user, updateUser } = useAuth();
  const resend = useResendVerification();
  const verify = useVerifyEmail();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  if (!user || user.emailVerified || user.isTelegramLinked) return null;

  const sendCode = () => {
    resend.mutate(undefined, {
      onSuccess: () => setSent(true),
      onError: (err) =>
        toast.error(err instanceof ApiRequestError ? err.message : t("auth.genericError")),
    });
  };

  const submit = (value: string) => {
    setError(undefined);
    verify.mutate(value, {
      onSuccess: (res) => {
        updateUser({ emailVerified: res.user.emailVerified });
        toast.success(t("auth.verifyEmail.success"));
      },
      onError: (err) => {
        setError(
          err instanceof ApiRequestError && err.code === "INVALID_CODE"
            ? t("auth.verifyEmail.invalidCode")
            : t("auth.genericError"),
        );
        setCode("");
      },
    });
  };

  return (
    <SettingsRow
      icon={MailIcon}
      label={t("profile.settings.emailVerification.title")}
      value={t("profile.settings.emailVerification.unverified")}
      expanded={expanded}
      onToggle={onToggle}
    >
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.emailVerification.hint", { email: user.email })}
      </p>
      {sent ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-muted-foreground">
            {t("profile.settings.emailVerification.sent")}
          </p>
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={submit}
            disabled={verify.isPending}
            {...(error ? { error } : {})}
          />
          <button
            type="button"
            onClick={sendCode}
            disabled={resend.isPending}
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-primary disabled:opacity-60"
          >
            {t("auth.verifyEmail.resend")}
          </button>
        </div>
      ) : (
        <Button onClick={sendCode} disabled={resend.isPending} className="self-start">
          {resend.isPending && <Spinner data-icon="inline-start" />}
          {t("profile.settings.emailVerification.send")}
        </Button>
      )}
    </SettingsRow>
  );
}

/** Words a confirmation phrase is drawn from — proper nouns, not sentences,
 * so they read the same regardless of site language rather than needing
 * their own i18n. Regenerated (word + 4 random digits) every time the
 * dialog opens, so it can't be muscle-memorised across attempts. */
const CONFIRM_WORDS = [
  "shadow",
  "sakura",
  "katana",
  "kitsune",
  "ronin",
  "yokai",
  "senpai",
  "tanuki",
];

function generateConfirmPhrase(): string {
  const word = CONFIRM_WORDS[Math.floor(Math.random() * CONFIRM_WORDS.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${digits}`;
}

/**
 * The very last thing in Settings, deliberately: a destructive action with
 * two independent guards — a freshly-generated phrase that has to be typed
 * exactly (so a reflexive double-click can't trigger it) and the actual
 * account password (so a merely-valid bearer token isn't enough on its
 * own). A Telegram-only account has no password to ask for — see
 * `isTelegramLinked` — so that field is skipped for it entirely rather than
 * shown disabled or asking for something that doesn't exist.
 */
function DeleteAccountSection({ profile }: { profile: MyProfile }) {
  const t = useT();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const deleteAccount = useDeleteAccount();

  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  const isTelegram = user?.isTelegramLinked ?? false;
  const phraseOk = typed.length > 0 && typed === phrase;
  const canSubmit = phraseOk && (isTelegram || password.length > 0);

  const openDialog = () => {
    setPhrase(generateConfirmPhrase());
    setTyped("");
    setPassword("");
    setError(undefined);
    setOpen(true);
  };

  const onConfirm = () => {
    setError(undefined);
    deleteAccount.mutate(
      { password },
      {
        onSuccess: () => {
          toast.success(t("profile.settings.dangerZone.success"));
          logout();
          navigate("/", { replace: true });
        },
        onError: (err) => {
          setError(
            err instanceof ApiRequestError && err.status === 401
              ? t("profile.settings.dangerZone.wrongPassword")
              : t("errors.genericTitle"),
          );
        },
      },
    );
  };

  const gif = useReactionGif("cry", open);

  return (
    <>
      {/* Deliberately not a card — a boxed "danger zone" with its own
          heading and border draws the eye exactly as much as every other
          setting on the page, which is backwards for the one thing here
          nobody should click by accident. Just a quiet link, easy to find
          if you're looking for it and easy to scroll past if you're not. */}
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground/70 transition-colors hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
        {t("profile.settings.dangerZone.deleteAccount")}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deleteAccount.isPending) setOpen(next);
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          {/* The one dialog on the site that's allowed to be a little
              theatrical — everywhere else, a confirm dialog is neutral by
              design; here, the whole point is making the visitor pause. */}
          <div className="relative flex flex-col items-center gap-2 border-b border-border/60 bg-gradient-to-b from-destructive/10 to-transparent px-6 pb-4 pt-6 text-center">
            <div className="size-28 overflow-hidden rounded-2xl bg-muted">
              {gif.data?.url && (
                <img src={gif.data.url} alt="" className="size-full object-cover" />
              )}
            </div>
            <DialogHeader className="items-center gap-1">
              <DialogTitle className="text-lg">
                {t("profile.settings.dangerZone.dialogTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("profile.settings.dangerZone.dialogBody", { name: profile.displayName })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-col gap-4 px-6 pb-6">
            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="delete-account-phrase" className="text-xs font-medium text-muted-foreground">
                {t("profile.settings.dangerZone.typePhrase")}
              </label>
              <code className="select-all rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-center font-mono text-sm tracking-wide">
                {phrase}
              </code>
              <TextInput
                id="delete-account-phrase"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={typed.length > 0 && !phraseOk ? true : undefined}
              />
              {typed.length > 0 && !phraseOk && (
                <p className="text-xs text-destructive">
                  {t("profile.settings.dangerZone.phraseMismatch")}
                </p>
              )}
            </div>

            {isTelegram ? (
              <p className="text-xs text-muted-foreground">
                {t("profile.settings.dangerZone.passwordHintTelegram")}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="delete-account-password" className="text-xs font-medium text-muted-foreground">
                  {t("profile.settings.dangerZone.password")}
                </label>
                <PasswordInput
                  id="delete-account-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            )}
          </div>

          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("profile.settings.dangerZone.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!canSubmit || deleteAccount.isPending}
              onClick={onConfirm}
            >
              {deleteAccount.isPending && <Spinner data-icon="inline-start" />}
              {t("profile.settings.dangerZone.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A one-time birth date confirmation — the only thing that unlocks R+-rated
 * titles anywhere on the site. Hentai stays excluded no matter what's set
 * here; there is no version of this control that shows it. Locked once
 * saved (mirrors the username field above) — it's meant to be a real fact
 * about the account, not a toggle.
 */
/** Bare content for the age-verification row — only ever shown expanded
 * while unset (see the row's onToggle above: once verified, there's a
 * status to show but nothing left to do, so it collapses for good). */
function AgeVerificationContent({
  profile,
  update,
}: {
  profile: MyProfile;
  update: ReturnType<typeof useUpdateProfile>;
}) {
  const t = useT();
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? "");
  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.hint")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={birthDate}
          max={maxDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          size="sm"
          className="shrink-0"
          disabled={update.isPending || !birthDate}
          onClick={() =>
            update.mutate(
              { birthDate },
              {
                onSuccess: () => toast.success(t("profile.settings.age.saved")),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : t("errors.genericTitle")),
              },
            )
          }
        >
          {t("profile.settings.save")}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {t("profile.settings.age.neverHentai")}
      </p>
    </>
  );
}

const MAX_FAVOURITE_GENRES = 30;

/** How much of the full list is shown before "show all". Rendering every
 *  genre at once was the densest thing on the page by a wide margin. */
const GENRE_PREVIEW_COUNT = 18;

/**
 * The favourite-genre picker.
 *
 * Previously: every genre the site knows, rendered as one flat wrap of
 * identical pills, with no search, no count, and a save whose failure was
 * invisible. Two things were actually broken by that. The list was a wall
 * you had to read linearly to find anything in, and picking more than the
 * thirty the API accepts produced a rejected request that nothing on screen
 * acknowledged — the button simply returned to idle, so the feature read as
 * dead.
 *
 * Now the picks are lifted out above the list (so the list below is only
 * ever "what you could add"), the rest is searchable and folded to a
 * preview, the cap is enforced and stated, and a failed save says so.
 */
function GenrePreferencesSection() {
  const t = useT();
  const labels = useLabels();
  const { data: allGenres } = useGenres();
  const { data: status } = useGenrePreferencesStatus();
  const setPrefs = useSetGenrePreferences();
  const [draft, setDraft] = useState<number[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const saved = status?.genreIds ?? [];
  const active = draft ?? saved;
  const remainingEdits = status?.remainingEdits ?? 1; // optimistic default pre-load
  const locked = remainingEdits <= 0;
  const dirty = draft != null && !arraysMatchAsSets(draft, saved);

  const genres = allGenres ?? [];
  const term = query.trim().toLowerCase();
  const picked = genres.filter((g) => active.includes(g.id));
  const pickable = genres
    .filter((g) => !active.includes(g.id))
    .filter((g) => !term || labels.genreLabel(g.name).toLowerCase().includes(term));
  // A search is already a narrowing, so it overrides the fold — hiding
  // matches behind "show all" would defeat the point of having typed.
  const visible = showAll || term ? pickable : pickable.slice(0, GENRE_PREVIEW_COUNT);
  const atCap = active.length >= MAX_FAVOURITE_GENRES;

  const toggle = (id: number) => {
    if (locked) return;
    const base = draft ?? saved;
    if (!base.includes(id) && base.length >= MAX_FAVOURITE_GENRES) {
      toast.error(t("profile.settings.genresMax", { max: MAX_FAVOURITE_GENRES }));
      return;
    }
    setDraft(base.includes(id) ? base.filter((g) => g !== id) : [...base, id]);
  };

  const save = () => {
    if (!draft) return;
    setPrefs.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("common.save"));
      },
      // Without this branch a rejected save did nothing observable at all.
      onError: (err) =>
        toast.error(
          err instanceof ApiRequestError
            ? err.message
            : t("profile.settings.genresSaveError"),
        ),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* What you've picked, first and on its own — the answer to "what did
          I choose?" should never require scanning the whole catalogue for
          highlighted pills. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {t("profile.settings.genresPicked", {
              count: active.length,
              max: MAX_FAVOURITE_GENRES,
            })}
          </span>
          {!locked && picked.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft([])}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {t("profile.settings.genresClear")}
            </button>
          )}
        </div>
        {picked.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-[11px] text-muted-foreground">
            {t("profile.settings.genresNonePicked")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={locked}
                onClick={() => toggle(g.id)}
                aria-label={t("profile.settings.genresRemove", {
                  genre: labels.genreLabel(g.name),
                })}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-lg border border-transparent bg-gradient-to-r from-primary via-primary/85 to-primary px-2.5 py-1 text-xs text-primary-foreground shadow-sm transition-all duration-200",
                  locked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5",
                )}
              >
                {labels.genreLabel(g.name)}
                {!locked && <XIcon className="size-3 opacity-70 group-hover:opacity-100" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {!locked && (
        <>
          {/* Search instead of scanning. Same pill and focus bloom as every
              other field on the site. */}
          <div className="group relative flex items-center rounded-full border border-border/60 bg-background/60 transition-all duration-200 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/15">
            <SearchIcon className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("profile.settings.genresSearch")}
              className="h-9 w-full rounded-full bg-transparent pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          {visible.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              {t("search.noMatches")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visible.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={false}
                  disabled={atCap}
                  onClick={() => toggle(g.id)}
                  className={cn(
                    "rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-all duration-200",
                    atCap
                      ? "cursor-not-allowed opacity-40"
                      : "hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {labels.genreLabel(g.name)}
                </button>
              ))}
            </div>
          )}

          {!term && pickable.length > GENRE_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="self-start text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              {showAll
                ? t("common.showLess")
                : t("profile.settings.genresShowAll", {
                    count: pickable.length - GENRE_PREVIEW_COUNT,
                  })}
            </button>
          )}
        </>
      )}

      {locked ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          {t("profile.settings.genresLocked")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="sm" disabled={!dirty || setPrefs.isPending} onClick={save}>
            {setPrefs.isPending && <Spinner data-icon="inline-start" />}
            {t("profile.settings.save")}
          </Button>
          <span className="text-[11px] text-muted-foreground/80">
            {t("profile.settings.genresRemaining", { count: remainingEdits })}
          </span>
        </div>
      )}
    </div>
  );
}

function arraysMatchAsSets(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((v) => set.has(v));
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <div className="relative -mt-6 sm:-mt-10">
        <Skeleton className="full-bleed h-44 rounded-none sm:h-60 lg:h-72" />
        <div className="relative -mt-16 flex flex-col gap-4 sm:-mt-20 lg:flex-row lg:items-end">
          <Skeleton className="size-28 rounded-full sm:size-36" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </div>
      <Skeleton className="h-24 rounded-3xl" />
      <Skeleton className="h-12 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    </div>
  );
}
