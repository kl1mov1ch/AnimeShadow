import { FrownIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useT } from "@/i18n";
import { imageSrc } from "@/lib/format";
import { useReactionGif } from "@/lib/query";

interface EmptyStateProps {
  icon?: ReactNode;
  /** "default" for a custom-sized media (e.g. a reaction gif) instead of a boxed icon. */
  mediaVariant?: "icon" | "default";
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon = <FrownIcon />,
  mediaVariant = "icon",
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant={mediaVariant}>{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

/**
 * A tiny, purely decorative reaction gif — no specific anime/character is
 * being represented here (nekos.best has no way to look those up), it's just
 * a bit of life on a page that otherwise has nothing to show. Falls back to
 * the plain icon silently if the fetch fails or hasn't resolved yet.
 */
function ReactionMedia({
  category,
  fallback,
}: {
  category: string;
  fallback: ReactNode;
}) {
  const { data } = useReactionGif(category);
  if (!data?.url) return <>{fallback}</>;
  return (
    <img
      src={imageSrc(data.url)}
      alt=""
      loading="lazy"
      className="size-20 rounded-xl object-cover sm:size-24"
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
          fallback={
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <SearchXIcon className="size-6" />
            </div>
          }
        />
      }
      mediaVariant="default"
      title={t("browse.noResultsTitle")}
      description={
        query
          ? t("browse.noResultsWithQuery", { query })
          : t("browse.noResults")
      }
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
      icon={<TriangleAlertIcon />}
      title={title ?? t("errors.genericTitle")}
      description={message ?? t("errors.genericBody")}
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
