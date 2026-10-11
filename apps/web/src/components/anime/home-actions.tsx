import { CompassIcon, type LucideIcon, ScanSearchIcon, ShuffleIcon, SparklesIcon } from "lucide-react";
import { FEATURES } from "@/lib/features";
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
  /** On a phone, where three tiles share a row. */
  short?: string;
  note: string;
  hint: string;
}

/**
 * Ways into the site that are not another row of posters: browse, search
 * by a frame (while it is on), personal picks, and "surprise me". A page made only of
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
    ...(FEATURES.frameSearch
      ? [
    {
      key: "frame",
      icon: ScanSearchIcon,
      to: "/frame-search",
      title: t("home.actions.frame"),
      note: t("home.actions.frameNote"),
      hint: t("home.actions.frameHint"),
    },
        ]
      : []),
    {
      key: "recs",
      icon: SparklesIcon,
      to: "/recommendations",
      title: t("home.actions.recs"),
      short: t("home.actions.recsShort"),
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
    <section className={cn("grid grid-cols-3 gap-2 sm:gap-3", actions.length > 3 && "lg:grid-cols-4")}>
      {actions.map(({ key, icon: Icon, to, title, short, note, hint }) => {
        const body = (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/[0.06] text-foreground/80 sm:size-10">
              <Icon className={cn("size-[18px]", key === "random" && rolling && "animate-spin")} />
            </span>
            <span className="w-full min-w-0 text-left">
              <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground sm:line-clamp-1 sm:text-sm">
                {short ? (
                  <>
                    <span className="sm:hidden">{short}</span>
                    <span className="hidden sm:inline">{title}</span>
                  </>
                ) : (
                  title
                )}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{note}</span>
            </span>
          </>
        );
        const shell =
          "group flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border/60 bg-card/50 p-3 transition-colors duration-200 hover:border-foreground/20 hover:bg-card sm:flex-row sm:items-center sm:gap-3 sm:p-3.5";

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
