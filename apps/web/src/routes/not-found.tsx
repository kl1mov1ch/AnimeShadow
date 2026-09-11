import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function Component() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p aria-hidden className="font-display text-6xl text-primary">
        影
      </p>
      <h1 className="font-display text-3xl">{t("errors.notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errors.notFoundBody")}</p>
      <Button asChild>
        <Link to="/">{t("errors.backToDiscover")}</Link>
      </Button>
    </div>
  );
}
