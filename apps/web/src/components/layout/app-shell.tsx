import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { AchievementWatcher } from "@/components/achievement-watcher";
import { CookieConsent } from "@/components/cookie-consent";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppShell() {
  // Re-key the outlet per top-level path so the .route-fade animation replays.
  const { pathname } = useLocation();
  const routeKey = pathname.split("/").slice(0, 3).join("/");

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:py-10">
          <div key={routeKey} className="route-fade">
            <Outlet />
          </div>
        </main>
        <SiteFooter />
      </div>
      <Toaster position="bottom-right" />
      <AchievementWatcher />
      <CookieConsent />
      <ScrollRestoration />
    </TooltipProvider>
  );
}
