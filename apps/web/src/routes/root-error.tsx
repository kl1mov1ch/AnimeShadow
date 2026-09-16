import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function RootError() {
  const t = useT();
  // The raw error (a stack trace, a bare "Cannot read properties of
  // undefined", …) is for the console/error tracker, never the page — a
  // visitor gets the same friendly line regardless of what actually broke.
  useRouteError();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p aria-hidden className="font-display text-5xl text-primary">
        影
      </p>
      <h1 className="font-display text-2xl">{t("errors.pageSnag")}</h1>
      <p className="text-sm text-muted-foreground">{t("errors.genericBody")}</p>
      <Button asChild>
        <Link to="/">{t("errors.backToDiscover")}</Link>
      </Button>
    </div>
  );
}
