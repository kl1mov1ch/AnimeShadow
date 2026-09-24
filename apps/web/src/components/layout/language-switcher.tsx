import { LOCALE_LABELS, LOCALES, type Locale } from "@animeshadow/shared";
import { LanguagesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DrawnCheck, MorphIcon } from "@/components/ui/morph-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t("locale.label")}>
              <MorphIcon on={open} off={LanguagesIcon} onIcon={XIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("locale.label")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {LOCALES.map((code: Locale) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => setLocale(code)}
            className="justify-between gap-6"
          >
            {LOCALE_LABELS[code]}
            {code === locale && <DrawnCheck key={locale} className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
