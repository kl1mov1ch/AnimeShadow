import type { AnimeSummary } from "@animeshadow/shared";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useLibrary, useUpsertLibraryEntry } from "@/lib/query";

/**
 * "Keep this one for later", as a hook: where the title stands in the
 * viewer's list, and the action that puts it there. Signed out it sends
 * them to sign in; already listed it opens the list.
 */
export function useKeep(anime: AnimeSummary, title: string) {
  const t = useT();
  const navigate = useNavigate();
  const { status } = useAuth();
  const authed = status === "authenticated";
  const { data: library } = useLibrary(undefined, authed);
  const upsert = useUpsertLibraryEntry();
  const entry = library?.find((e) => e.anime.id === anime.id) ?? null;

  const keep = (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!authed) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }
    if (entry) {
      navigate("/library");
      return;
    }
    upsert.mutate(
      { animeId: anime.id, input: { status: "PLANNED", score: null, notes: null } },
      {
        onSuccess: () =>
          toast.success(t("library.savedStatus", { title, status: t("status.PLANNED") })),
        onError: () => toast.error(t("library.saveError")),
      },
    );
  };

  return { entry, keep, pending: upsert.isPending };
}
