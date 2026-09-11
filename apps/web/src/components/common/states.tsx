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

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon = <FrownIcon />,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function NoResultsState({ query }: { query?: string }) {
  const t = useT();
  return (
    <EmptyState
      icon={<SearchXIcon />}
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
