import type { MyProfile } from "@animeshadow/shared";
import {
  LayoutDashboardIcon,
  LockIcon,
  PaletteIcon,
  UploadIcon,
  UserCogIcon,
} from "lucide-react";
import { useState } from "react";
import { CosmeticsPicker } from "@/components/profile/cosmetics-picker";
import { LayoutEditor } from "@/components/profile/profile-blocks";
import {
  AccentSection,
  PortabilitySection,
  PrivacySection,
  SettingsSearchBox,
  SettingsSearchProvider,
} from "@/components/profile/profile-settings-extras";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type StudioTab = "look" | "blocks" | "privacy" | "account" | "list";

const TABS: Array<{ id: StudioTab; icon: typeof PaletteIcon }> = [
  { id: "look", icon: PaletteIcon },
  { id: "blocks", icon: LayoutDashboardIcon },
  { id: "privacy", icon: LockIcon },
  { id: "account", icon: UserCogIcon },
  { id: "list", icon: UploadIcon },
];

/**
 * Everything about the profile that can be changed, behind one button.
 *
 * It used to be spread over four entry points — an "edit" button and a
 * gear in the header that opened the same dialog, a "customise" card in the
 * side column with its own frame and title pickers, and a "customise"
 * switch above the blocks — so the same setting could be found in two
 * places and nothing said which one was the real one. Now there is one
 * place, split by what the setting is about. The avatar and the banner
 * are still edited on themselves, in the header, because that is where
 * you see them.
 */
export function ProfileStudio({
  profile,
  open,
  onOpenChange,
  account,
}: {
  profile: MyProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account settings form, which lives with the profile page. */
  account: React.ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<StudioTab>("look");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <SettingsSearchProvider>
          <DialogHeader className="border-b border-[var(--accent-line-soft)] px-5 pb-4 pt-5">
            <DialogTitle className="font-display text-xl">{t("profile.studio.title")}</DialogTitle>
            <DialogDescription>{t("profile.studio.hint")}</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--accent-line-soft)] p-2 [scrollbar-width:none] sm:w-48 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
              {TABS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={tab === id}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    tab === id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <Icon className="size-4" />
                  {t(`profile.studio.tabs.${id}` as "profile.studio.tabs.look")}
                </button>
              ))}
            </nav>

            <div key={tab} className="min-h-0 flex-1 animate-in overflow-y-auto p-4 fade-in-0 slide-in-from-right-2 duration-300 sm:p-5">
              {tab === "look" && (
                <div className="flex flex-col gap-5">
                  <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {t("profile.studio.mediaHint")}
                  </p>
                  <CosmeticsPicker profile={profile} />
                  <AccentSection profile={profile} />
                </div>
              )}
              {tab === "blocks" && <LayoutEditor layout={profile.layout} />}
              {tab === "privacy" && <PrivacySection profile={profile} />}
              {tab === "account" && (
                <div className="flex flex-col gap-3">
                  <SettingsSearchBox />
                  {account}
                </div>
              )}
              {tab === "list" && <PortabilitySection />}
            </div>
          </div>
        </SettingsSearchProvider>
      </DialogContent>
    </Dialog>
  );
}
