import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/hooks/use-auth";
import { defaultMobileNavigation, useMobileNavigation } from "@/lib/mobile-navigation";
import { NAVIGATION_ITEMS, navigationActive } from "@/lib/navigation-items";
import { OPEN_SEARCH_EVENT, SEARCH_STATE_EVENT } from "@/lib/search-events";
import { NavigationBar } from "./navigation-bar";

export function MobileNav() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const { data } = useMobileNavigation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const changed = (event: Event) => setSearchOpen(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(SEARCH_STATE_EVENT, changed);
    return () => window.removeEventListener(SEARCH_STATE_EVENT, changed);
  }, []);
  const authed = status === "authenticated";
  const buttons = authed ? (data ?? defaultMobileNavigation()).buttons : defaultMobileNavigation().buttons;
  return <div className="mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
    <div className="mx-auto w-full max-w-xl"><NavigationBar buttons={buttons} active={searchOpen ? "search" : notificationsOpen ? "notifications" : navigationActive(pathname, buttons)} onSearch={() => { setSearchOpen(true); window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)); }}
      renderItem={(id, selected, className, children) => {
        const item = NAVIGATION_ITEMS[id];
        if (id === "notifications" && authed) return <NotificationBell className={className} side="top" onOpenChange={setNotificationsOpen}>{children}</NotificationBell>;
        return <Link to={item.private && !authed ? "/login" : item.to} state={item.private && !authed ? { from: item.to } : undefined} aria-label={item.label} aria-current={selected ? "page" : undefined} className={className}>{children}</Link>;
      }} /></div>
  </div>;
}
