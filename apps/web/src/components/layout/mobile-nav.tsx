import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/hooks/use-auth";
import { defaultMobileNavigation, useMobileNavigation } from "@/lib/mobile-navigation";
import { NAVIGATION_ITEMS, navigationActive } from "@/lib/navigation-items";
import { OPEN_SEARCH_EVENT } from "@/lib/search-events";
import { NavigationBar } from "./navigation-bar";

export function MobileNav() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const { data } = useMobileNavigation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const authed = status === "authenticated";
  const buttons = authed ? (data ?? defaultMobileNavigation()).buttons : defaultMobileNavigation().buttons;
  return <div className="mobile-nav pointer-events-none fixed inset-x-0 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:hidden">
    <div className="pointer-events-auto max-w-full overflow-hidden rounded-[1.25rem] border border-border/70 bg-card shadow-lg shadow-black/25"><NavigationBar buttons={buttons} active={notificationsOpen ? "notifications" : navigationActive(pathname, buttons)} onSearch={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      renderItem={(id, selected, className, children) => {
        const item = NAVIGATION_ITEMS[id];
        if (id === "notifications" && authed) return <NotificationBell className={className} side="top" onOpenChange={setNotificationsOpen}>{children}</NotificationBell>;
        return <Link to={item.private && !authed ? "/login" : item.to} state={item.private && !authed ? { from: item.to } : undefined} aria-label={item.label} aria-current={selected ? "page" : undefined} className={className}>{children}</Link>;
      }} /></div>
  </div>;
}
