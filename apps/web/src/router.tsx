import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { RootError } from "@/routes/root-error";

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span aria-hidden className="font-display text-4xl text-primary animate-pulse">
        影
      </span>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RootError />,
    HydrateFallback: RouteFallback,
    children: [
      { index: true, lazy: () => import("@/routes/discover") },
      { path: "browse", lazy: () => import("@/routes/browse") },
      { path: "genre/:name", lazy: () => import("@/routes/genre-redirect") },
      { path: "anime/:id", lazy: () => import("@/routes/anime-detail") },
      { path: "anime/:id/:slug", lazy: () => import("@/routes/anime-detail") },
      { path: "library", lazy: () => import("@/routes/library") },
      { path: "profile", lazy: () => import("@/routes/profile") },
      { path: "profile/:username", lazy: () => import("@/routes/profile") },
      { path: "about", lazy: () => import("@/routes/about") },
      { path: "support", lazy: () => import("@/routes/support") },
      { path: "login", lazy: () => import("@/routes/login") },
      { path: "register", lazy: () => import("@/routes/register") },
      { path: "*", lazy: () => import("@/routes/not-found") },
    ],
  },
]);
