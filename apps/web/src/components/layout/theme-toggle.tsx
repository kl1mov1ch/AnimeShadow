import { MoonStarIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { useUpdateProfile } from "@/lib/query";

export function ThemeToggle() {
  const t = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const { status } = useAuth();
  const update = useUpdateProfile();
  const isDark = resolvedTheme === "dark";

  const choose = (next: "light" | "dark") => {
    setTheme(next);
    // Written back to the account as well, not just localStorage. ThemeSync
    // applies the account's theme on every load, so a toggle that only
    // touched local storage was undone by the next reload — the account
    // still held the old value and won. The Settings picker has always
    // saved both; this one has to agree with it or the two fight.
    if (status === "authenticated") update.mutate({ theme: next });
  };

  const label = isDark ? t("theme.toLight") : t("theme.toDark");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => choose(isDark ? "light" : "dark")}
          aria-label={label}
        >
          {/* The moon turns into the sun and back, so the button shows
              which way it goes rather than flashing a different glyph. */}
          <MorphIcon on={isDark} off={MoonStarIcon} onIcon={SunIcon} className="size-4" spin="ccw" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
