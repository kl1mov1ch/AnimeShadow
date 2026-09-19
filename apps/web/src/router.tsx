import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RootError } from "@/routes/root-error";
import { RouteError } from "@/routes/route-error";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span aria-hidden className="text-4xl text-primary">
        <SlicedGlyph />
      </span>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    // Only reached if AppShell itself throws (header/nav/footer included) —
    // an actual last resort, not the everyday error path below.
    errorElement: <RootError />,
    HydrateFallback: RouteFallback,
    children: [
      {
        // A pathless boundary: a crash in any one page is caught here and
        // rendered into AppShell's own <Outlet/>, so the header, nav and
        // footer stay put and the visitor can still get anywhere else on
        // the site — the old setup let a single broken page take down the
        // whole shell along with it.
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: () => import("@/routes/discover") },
          { path: "browse", lazy: () => import("@/routes/browse") },
          { path: "genre/:name", lazy: () => import("@/routes/genre-redirect") },
          { path: "anime/:id", lazy: () => import("@/routes/anime-detail") },
          { path: "anime/:id/:slug", lazy: () => import("@/routes/anime-detail") },
          { path: "library", lazy: () => import("@/routes/library") },
          { path: "recommendations", lazy: () => import("@/routes/recommendations") },
          { path: "frame-search", lazy: () => import("@/routes/frame-search") },
          { path: "profile", lazy: () => import("@/routes/profile") },
          { path: "profile/:username", lazy: () => import("@/routes/profile") },
          { path: "admin", lazy: () => import("@/routes/admin") },
          { path: "about", lazy: () => import("@/routes/about") },
          { path: "support", lazy: () => import("@/routes/support") },
          { path: "login", lazy: () => import("@/routes/login") },
          { path: "register", lazy: () => import("@/routes/register") },
          { path: "verify-email", lazy: () => import("@/routes/verify-email") },
          { path: "forgot-password", lazy: () => import("@/routes/forgot-password") },
          { path: "reset-password", lazy: () => import("@/routes/reset-password") },
          { path: "*", lazy: () => import("@/routes/not-found") },
        ],
      },
    ],
  },
]);
