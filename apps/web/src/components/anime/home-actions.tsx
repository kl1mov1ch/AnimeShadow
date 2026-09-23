import { CompassIcon, type LucideIcon, ScanSearchIcon, ShuffleIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Action {
  key: string;
  icon: LucideIcon;
  to?: string;
  title: string;
  note: string;
  hint: string;
}

/**
 * Four ways into the site that are not another row of posters: browse,
 * search by a frame, personal picks, and "surprise me". A page made only of
 * anime cards gives a visitor nothing to do but scroll; this is the part
 * that offers them something.
 */
export function HomeActions() {
  const t = useT();
  const navigate = useNavigate();
  const [rolling, setRolling] = useState(false);

  const surprise = async () => {
    if (rolling) return;
    setRolling(true);
    try {
      const random = await apiRequest<{ slug: string }>("/anime/random");
      navigate(`/anime/${random.slug}`, { viewTransition: true });
    } catch {
      navigate("/browse");
    } finally {
      setRolling(false);
    }
  };

  const actions: Action[] = [
    {
      key: "browse",
      icon: CompassIcon,
      to: "/browse",
      title: t("home.actions.browse"),
      note: t("home.actions.browseNote"),
      hint: t("home.actions.browseHint"),
    },
    {
      key: "frame",
      icon: ScanSearchIcon,
      to: "/frame-search",
      title: t("home.actions.frame"),
      note: t("home.actions.frameNote"),
      hint: t("home.actions.frameHint"),
    },
    {
      key: "recs",
      icon: SparklesIcon,
      to: "/recommendations",
      title: t("home.actions.recs"),
      note: t("home.actions.recsNote"),
      hint: t("home.actions.recsHint"),
    },
    {
      key: "random",
      icon: ShuffleIcon,
      title: t("home.actions.random"),
      note: t("home.actions.randomNote"),
      hint: t("home.actions.randomHint"),
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map(({ key, icon: Icon, to, title, note, hint }) => {
        const body = (
          <>
            {/* The band of light: one transform on one element. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-[220%] -skew-x-12 bg-gradient-to-r from-transparent via-foreground/10 to-transparent transition-transform duration-700 ease-out will-change-transform group-hover:translate-x-[420%] motion-reduce:hidden"
            />
            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
              <Icon className={cn("size-5", key === "random" && rolling && "animate-spin")} />
            </span>
            <span className="relative min-w-0 text-left">
              <span className="block truncate text-sm font-medium text-foreground">{title}</span>
              <span className="block truncate text-xs text-muted-foreground">{note}</span>
            </span>
          </>
        );
        const shell =
          "group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-3.5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5";

        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              {to ? (
                <Link to={to} viewTransition className={shell}>
                  {body}
                </Link>
              ) : (
                <button type="button" onClick={surprise} className={cn(shell, "text-left")}>
                  {body}
                </button>
              )}
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </section>
  );
}
