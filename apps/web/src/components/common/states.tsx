import { QuoteIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useLocale, useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useReactionGif } from "@/lib/query";
import { cn } from "@/lib/utils";
import { LogoAlert } from "@/components/brand/logo-alert";
import { SlicedGlyph } from "@/components/brand/sliced-glyph";

interface EmptyStateProps {
  icon?: ReactNode;
  /** "default" for a custom-sized media (e.g. a reaction gif) instead of a boxed icon. */
  mediaVariant?: "icon" | "default";
  title: string;
  description?: string;
  action?: ReactNode;
  /** Which rotating line set to show under the description, if any. */
  quotes?: QuoteSet;
}

/* ---------- quips ---------- */

type QuoteSet = "load" | "empty";

/**
 * Written for this site, in its own voice — deliberately not quotes from
 * any actual anime. Lines of dialogue belong to the work they come from,
 * so a page that fails to load gets AnimeShadow being sarcastic about
 * itself instead of borrowing someone else's script.
 *
 * Same locale-keyed shape as the search box's mood chips, for the same
 * reason: `t()` returns strings, not arrays.
 */
const QUIPS: Record<QuoteSet, { ru: string[]; en: string[] }> = {
  load: {
    ru: [
      "Сервер отвернулся и делает вид, что нас тут нет.",
      "Где-то упал один запрос. Мы уже делаем вид, что это не мы.",
      "Данные вышли на минутку. Обещали вернуться.",
      "Технически это не ошибка. Технически.",
      "Мы спросили у сервера. Он многозначительно промолчал.",
      "Перезагрузка чинит примерно всё. Проверим теорию?",
      "Здесь должно было быть аниме. Здесь — вот это.",
    ],
    en: [
      "The server turned away and is pretending we're not here.",
      "A request fell over somewhere. We're pretending it wasn't us.",
      "The data stepped out for a minute. It promised to come back.",
      "Technically this isn't an error. Technically.",
      "We asked the server. It stayed meaningfully silent.",
      "Reloading fixes roughly everything. Shall we test that?",
      "There was supposed to be anime here. Instead, there's this.",
    ],
  },
  empty: {
    ru: [
      "Пусто. Даже эхо не отвечает.",
      "Ничего не нашлось — зато как искали.",
      "Фильтры сработали идеально: не выжило ничего.",
      "Здесь мог быть ваш тайтл, но он предпочёл скрыться.",
      "Совпадений ноль. Каталог разводит руками.",
      "Мы перерыли всё и нашли только этот текст.",
    ],
    en: [
      "Empty. Even the echo declined to answer.",
      "Nothing found — but what a search it was.",
      "The filters worked perfectly: nothing survived them.",
      "Your title could have been here, but it chose to hide.",
      "Zero matches. The catalogue shrugs.",
      "We searched everywhere. All we found was this sentence.",
    ],
  },
};

/** How long each line stays up before the next one slides in. */
const QUIP_ROTATE_MS = 5_000;

/**
 * A small rotating line under an empty/error state. Starts on a random
 * entry so two failures in a row don't greet you with the same sentence,
 * then cycles on its own; clicking steps it manually.
 *
 * The rotation is a text swap on an interval, not a running animation —
 * nothing keeps compositing once a line has settled. Under
 * `prefers-reduced-motion` the global stylesheet already collapses the
 * entry transition, and the interval is left alone since it isn't motion
 * so much as changing copy.
 */
function QuipRotator({ set }: { set: QuoteSet }) {
  const { locale } = useLocale();
  const lines = locale === "ru" ? QUIPS[set].ru : QUIPS[set].en;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * lines.length));

  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % lines.length),
      QUIP_ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [lines.length]);

  const line = lines[index % lines.length];
  if (!line) return null;

  return (
    <button
      type="button"
      onClick={() => setIndex((i) => (i + 1) % lines.length)}
      className="group mx-auto mt-1 flex max-w-sm items-start gap-2 rounded-2xl border border-border/60 bg-card/50 px-3.5 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
    >
      <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-primary/60" />
      <span className="flex min-w-0 flex-col gap-1">
        {/* Keyed on the line itself, so React remounts it and the entry
            animation replays on every rotation. */}
        <span
          key={line}
          className="animate-in fade-in slide-in-from-bottom-1 text-xs leading-relaxed text-foreground/80 duration-500"
        >
          {line}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
          <SlicedGlyph className="text-primary/70" />
          AnimeShadow
        </span>
      </span>
    </button>
  );
}

/** The site's mark in the icon box — the default picture for "nothing here". */
export function LogoMedia({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary",
        className,
      )}
    >
      <SlicedGlyph className="text-[1.75rem]" />
    </span>
  );
}

export function EmptyState({
  icon,
  mediaVariant = "icon",
  title,
  description,
  action,
  quotes,
}: EmptyStateProps) {
  return (
    <Empty className="border" data-glyph-host>
      <EmptyHeader>
        {/* No icon given: the site's mark, which brings its own box. */}
        <EmptyMedia variant={icon ? mediaVariant : "default"}>{icon ?? <LogoMedia />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
        {quotes && <QuipRotator set={quotes} />}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/**
 * A tiny, purely decorative reaction gif — no specific anime/character is
 * being represented here (nekos.best has no way to look those up), it's just
 * a bit of life on a page that otherwise has nothing to show.
 *
 * Gif first; the site's mark while it is on its way, when the lookup fails,
 * or when the image itself will not load. Never a broken picture.
 */
function ReactionMedia({
  category,
  fallback,
  className,
}: {
  category: string;
  fallback: ReactNode;
  className?: string;
}) {
  const { data } = useReactionGif(category);
  const [broken, setBroken] = useState(false);
  if (!data?.url || broken) return <>{fallback}</>;
  return (
    <img
      src={imageSrc(data.url)}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn(
        "animate-in fade-in zoom-in-95 size-20 rounded-2xl object-cover shadow-lg shadow-black/10 duration-500 sm:size-24",
        className,
      )}
    />
  );
}

export function NoResultsState({ query }: { query?: string }) {
  const t = useT();
  return (
    <EmptyState
      icon={
        <ReactionMedia
          category="shrug"
          fallback={<LogoMedia />}
        />
      }
      mediaVariant="default"
      title={t("browse.noResultsTitle")}
      description={
        query
          ? t("browse.noResultsWithQuery", { query })
          : t("browse.noResults")
      }
      quotes="empty"
    />
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const t = useT();
  return (
    <EmptyState
      icon={
        // A gif that has the decency to look sorry; failing that, the
        // site's own mark with an exclamation badge.
        <ReactionMedia category="cry" fallback={<LogoAlert />} />
      }
      mediaVariant="default"
      title={title ?? t("errors.genericTitle")}
      description={message ?? t("errors.genericBody")}
      quotes="load"
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {t("common.tryAgain")}
          </Button>
        ) : undefined
      }
    />
  );
}
