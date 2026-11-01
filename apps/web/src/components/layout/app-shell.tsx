import { GuestNudge } from "@/components/auth/guest-nudge";
import { PushOffer } from "@/components/push-offer";
import { CookieConsent } from "@/components/cookie-consent";
import { NavProgress } from "@/components/layout/nav-progress";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { captureReferral } from "@/lib/referral";
import { useGifLibrary, warmGifs } from "@/lib/gifs";
import { ReferralWatcher } from "@/components/referral-watcher";
import { AchievementWatcher } from "@/components/achievement-watcher";
import { GlobalTitleTooltips } from "@/components/common/global-title-tooltips";
import { SearchCommandMount } from "@/components/layout/search-command-mount";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useExternalAnalytics } from "@/hooks/use-external-analytics";
import { usePageviewBeacon } from "@/hooks/use-pageview-beacon";
import { useServerHeadHandoff } from "@/hooks/use-server-head-handoff";
import { MusicPlayer } from "@/components/music/music-player";

const SiteBackground = lazy(() => import("./site-background"));

export function AppShell() {
  // Re-key the outlet per top-level path so the .route-fade animation replays.
  const { pathname } = useLocation();
  const studioPage = /^\/studio\/hon-kon(?:\/(?:releases|workspace))?\/?$/.test(pathname);
  const routeKey = pathname.split("/").slice(0, 3).join("/");
  usePageviewBeacon();
  useExternalAnalytics();
  // ?ref=CODE on any page: kept until the visitor signs up.
  useEffect(() => captureReferral(), []);
  // The site's gifs: the list once, the common ones fetched while idle.
  const { data: gifLibrary } = useGifLibrary();
  const warmed = useRef(false);
  useEffect(() => {
    if (warmed.current || !gifLibrary || Object.keys(gifLibrary).length === 0) return;
    warmed.current = true;
    warmGifs(gifLibrary);
  }, [gifLibrary]);
  useServerHeadHandoff();

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={500}>
      <div className="relative isolate flex min-h-dvh flex-col pb-[calc(var(--mobile-nav-space)+var(--music-player-space,0px))]">
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-background" />
        <Suspense fallback={null}><SiteBackground /></Suspense>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:py-10">
          <div key={routeKey} className="route-fade">
            <Outlet />
          </div>
        </main>
        <SiteFooter />
        <MobileNav />
      </div>
      {/* Mounted once, globally: it owns ⌘K for the whole app, and pulls the
          palette itself down only when that key is first pressed. */}
      <SearchCommandMount />
      <MusicPlayer />
      <Toaster position="bottom-right" />
      <AchievementWatcher />
      {!studioPage && <GuestNudge />}
      {!studioPage && <PushOffer />}
      <CookieConsent />
      <NavProgress />
      <ReferralWatcher />
      {/* Every plain `title` hint on the site, drawn as the site's tooltip. */}
      <GlobalTitleTooltips />
      <ScrollRestoration />
    </TooltipProvider>
  );
}
