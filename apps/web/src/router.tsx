import { createBrowserRouter, type LoaderFunctionArgs, redirect } from "react-router-dom";
import { prefetchAnime } from "@/lib/prefetch";

function animeLoader({ params }: LoaderFunctionArgs) {
  if (params.id) prefetchAnime(params.id);
  return null;
}
import { AppShell } from "@/components/layout/app-shell";
import { RootError } from "@/routes/root-error";
import { RouteError } from "@/routes/route-error";

/** The same boot screen the HTML draws, until the first page is ready. */
function RouteFallback() {
  return (
    <div className="boot" role="status" aria-label="Загрузка">
      <div className="boot-mark">
        <span className="boot-ring" />
        <span className="boot-glyph">影</span>
      </div>
      <div className="boot-name">AnimeShadow</div>
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
          { path: "studios", lazy: () => import("@/routes/studios") },
          { path: "studios/:slug", lazy: () => import("@/routes/dub-studio") },
          { path: "studio/hon-kon", lazy: () => import("@/routes/studio-honkon") },
          { path: "studio/hon-kon/releases", lazy: () => import("@/routes/studio-workspace") },
          { path: "studio/hon-kon/workspace", loader: () => redirect("/studio/hon-kon/releases") },
          // Landing pages for what people search for — one clean address each.
          { path: "genre/:slug", lazy: () => import("@/routes/landing") },
          { path: "top", lazy: () => import("@/routes/landing") },
          { path: "popular", lazy: () => import("@/routes/landing") },
          { path: "ongoing", lazy: () => import("@/routes/landing") },
          { path: "announced", lazy: () => import("@/routes/landing") },
          { path: "movies", lazy: () => import("@/routes/landing") },
          { path: "season/:year/:season", lazy: () => import("@/routes/landing") },
          { path: "year/:year", lazy: () => import("@/routes/landing") },
          // The loader starts every request the page needs while its code
          // is still downloading — nothing waits for anything else.
          { path: "anime/:id", loader: animeLoader, lazy: () => import("@/routes/anime-detail") },
          // One address per episode ("<название> 5 серия" is what people search).
          { path: "anime/:id/episode/:episode", loader: animeLoader, lazy: () => import("@/routes/anime-detail") },
          { path: "anime/:id/:slug", loader: animeLoader, lazy: () => import("@/routes/anime-detail") },
          { path: "library", lazy: () => import("@/routes/library") },
          { path: "recommendations", lazy: () => import("@/routes/recommendations") },
          { path: "frame-search", lazy: () => import("@/routes/frame-search") },
          { path: "collections", lazy: () => import("@/routes/collections") },
          { path: "schedule", lazy: () => import("@/routes/schedule") },
          { path: "party", lazy: () => import("@/routes/parties") },
          { path: "party/:code", lazy: () => import("@/routes/party") },
          { path: "collections/new", lazy: () => import("@/routes/collection-edit") },
          { path: "collections/stats", lazy: () => import("@/routes/collections-stats") },
          { path: "collections/c/:slug", lazy: () => import("@/routes/curated-collection") },
          { path: "collections/:id", lazy: () => import("@/routes/collection") },
          { path: "collections/:id/edit", lazy: () => import("@/routes/collection-edit") },
          { path: "profile", lazy: () => import("@/routes/profile") },
          { path: "profile/:username", lazy: () => import("@/routes/profile") },
          { path: "admin", lazy: () => import("@/routes/admin") },
          { path: "about", lazy: () => import("@/routes/about") },
          { path: "legal", lazy: () => import("@/routes/legal") },
          { path: "copyright", loader: () => redirect("/legal?doc=copyright") },
          { path: "privacy", loader: () => redirect("/legal?doc=privacy") },
          { path: "terms", loader: () => redirect("/legal?doc=terms") },
          { path: "offer", loader: () => redirect("/legal?doc=terms") },
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
