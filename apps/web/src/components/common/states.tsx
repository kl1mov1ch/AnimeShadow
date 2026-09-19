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
 * Written for this site, in its own voice: jabs at our own server, many of
 * them riffing on lines every anime fan knows — parodied, never quoted, so
 * the joke is ours and the original stays with the work it came from.
 *
 * Same locale-keyed shape as the search box's mood chips, for the same
 * reason: `t()` returns strings, not arrays.
 */
const QUIPS: Record<QuoteSet, { ru: string[]; en: string[] }> = {
  load: {
    ru: [
      "Сервер уже мёртв. Просто он ещё об этом не знает.",
      "Это не баг. Это мой путь ниндзя.",
      "Запрос использовал технику теневого клонирования и потерялся во всех копиях сразу.",
      "Мы вложили в загрузку всю силу дружбы. Не хватило.",
      "Сервер ушёл в свой филлерный арк. Вернётся через сорок серий.",
      "Твой интернет — это даже не моя финальная форма. А вот наш сервер — да.",
      "Загрузка прервалась на самом интересном. Продолжение — в следующей серии.",
      "Бэкенд ушёл тренироваться в горы. Писем не оставил.",
      "Технически это не ошибка. Технически это арка страданий.",
      "Нажми «Повторить». Даже главный герой встаёт с восьмой попытки.",
    ],
    en: [
      "The server is already dead. It just hasn't noticed yet.",
      "It's not a bug. It's my ninja way.",
      "The request used shadow clone jutsu and got lost in every copy at once.",
      "We loaded this with the full power of friendship. It wasn't enough.",
      "The server has entered its filler arc. Back in about forty episodes.",
      "Your connection isn't even my final form. Our server's, sadly, is.",
      "The load cut out at the best part. To be continued next episode.",
      "The backend went off to train in the mountains. Left no note.",
      "Technically this isn't an error. Technically it's a suffering arc.",
      "Hit retry. Even the protagonist gets up on the eighth attempt.",
    ],
  },
  empty: {
    ru: [
      "Пусто. Как обещания сиквела после открытого финала.",
      "Ничего не нашлось. Даже гарем главного героя больше этого списка.",
      "Фильтры сработали идеально: не выжил никто. Как во втором сезоне.",
      "Здесь мог быть ваш тайтл, но он ушёл в исекай.",
      "Совпадений ноль. Каталог сделал лицо «я не понимаю, что происходит».",
      "Мы перерыли всё. Нашли только флешбэк, который никто не просил.",
      "Этот поиск закончился раньше, чем аниме-адаптация манги.",
      "Искали с силой девяти тысяч. Результатов — ноль.",
    ],
    en: [
      "Empty. Like sequel promises after an open ending.",
      "Nothing found. Even the protagonist's harem is bigger than this list.",
      "The filters worked perfectly: nobody survived. Just like season two.",
      "Your title could have been here, but it got isekai'd.",
      "Zero matches. The catalogue is doing its best confused-anime face.",
      "We searched everywhere. Found only a flashback nobody asked for.",
      "This search ended sooner than an anime adaptation of a manga.",
      "Searched at a power level over nine thousand. Results: zero.",
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
      // A fifth of the page wide (never narrower than a phone can read
      // comfortably), centred, and at most three lines: long enough for a
      // line to breathe, short enough that it never becomes a paragraph.
      className="group mx-auto flex w-[max(18rem,20vw)] max-w-full items-start gap-2.5 rounded-2xl border border-border/60 bg-card/50 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30"
    >
      <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-primary/60" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Keyed on the line itself, so React remounts it and the entry
            animation replays on every rotation. Balanced wrapping keeps the
            lines even instead of leaving one word dangling on the last. */}
        <span
          key={line}
          className="animate-in fade-in slide-in-from-bottom-1 line-clamp-3 text-[13px] leading-snug text-foreground/85 [text-wrap:balance] duration-500"
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
        "sliced-glyph-host grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary",
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
    <Empty className="border">
      <EmptyHeader>
        {/* No icon given: the site's mark, which brings its own box. */}
        <EmptyMedia variant={icon ? mediaVariant : "default"}>{icon ?? <LogoMedia />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {/* Outside the header, whose own narrow max-width would otherwise
          wrap the line into a column. */}
      {quotes && <QuipRotator set={quotes} />}
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
