import { Navigate, useParams } from "react-router-dom";
import { useGenres } from "@/lib/query";

/** /genre/<name> — a crawlable landing URL that resolves to the browse filter. */
export function Component() {
  const { name } = useParams();
  const { data: genres, isPending } = useGenres();

  if (isPending) return null;
  const match = genres?.find(
    (g) => g.name.toLowerCase() === (name ?? "").toLowerCase(),
  );
  return (
    <Navigate
      to={
        match
          ? `/browse?genres=${match.id}`
          : `/browse?q=${encodeURIComponent(name ?? "")}`
      }
      replace
    />
  );
}
