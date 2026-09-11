import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function RootError() {
  const t = useT();
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : t("errors.genericBody");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p aria-hidden className="font-display text-5xl text-primary">
        影
      </p>
      <h1 className="font-display text-2xl">{t("errors.pageSnag")}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild>
        <Link to="/">{t("errors.backToDiscover")}</Link>
      </Button>
    </div>
  );
}
