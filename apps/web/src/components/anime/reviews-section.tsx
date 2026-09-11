import { type Review, upsertReviewInputSchema } from "@animeshadow/shared";
import { StarIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useLabels } from "@/lib/labels";
import { useDeleteReview, useReviews, useUpsertReview } from "@/lib/query";

const RATINGS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

interface ReviewsSectionProps {
  animeId: number;
  active: boolean;
}

export function ReviewsSection({ animeId, active }: ReviewsSectionProps) {
  const t = useT();
  const { data, isPending } = useReviews(animeId, active);
  const { status: authStatus } = useAuth();

  if (isPending && active) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1 text-base font-semibold">
          <StarIcon className="size-4 fill-primary text-primary" />
          {data.summary.average != null ? data.summary.average.toFixed(1) : "—"}
        </span>
        <span className="text-muted-foreground">
          {t("reviews.count", { count: data.summary.count })}
        </span>
      </div>

      {authStatus === "authenticated" ? (
        <ReviewForm animeId={animeId} existing={data.mine} />
      ) : (
        <Button asChild variant="secondary" className="self-start">
          <Link to="/login" state={{ from: window.location.pathname }}>
            {t("reviews.signInToReview")}
          </Link>
        </Button>
      )}

      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reviews.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const t = useT();
  const labels = useLabels();
  return (
    <li className="flex gap-3 rounded-lg border bg-card p-4">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="text-xs font-semibold">
          {review.author.displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{review.author.displayName}</span>
          {review.isMine && (
            <Badge variant="outline" className="text-xs">
              {t("reviews.you")}
            </Badge>
          )}
          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
            <StarIcon className="size-3 fill-primary text-primary" />
            {review.rating}/10
          </span>
          <span className="text-xs text-muted-foreground">
            {labels.formatDate(review.updatedAt)}
          </span>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {review.body}
        </p>
      </div>
    </li>
  );
}

function ReviewForm({
  animeId,
  existing,
}: {
  animeId: number;
  existing: Review | null;
}) {
  const t = useT();
  const upsert = useUpsertReview(animeId);
  const remove = useDeleteReview(animeId);

  const [rating, setRating] = useState(String(existing?.rating ?? 8));
  const [body, setBody] = useState(existing?.body ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(String(existing?.rating ?? 8));
    setBody(existing?.body ?? "");
  }, [existing]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = upsertReviewInputSchema.safeParse({
      rating: Number(rating),
      body,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "");
      return;
    }
    setError(null);
    upsert.mutate(parsed.data, {
      onSuccess: () => toast.success(t("reviews.published")),
      onError: (err) =>
        setError(err instanceof ApiRequestError ? err.message : t("auth.genericError")),
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <p className="text-sm font-medium">
        {existing ? t("reviews.edit") : t("reviews.write")}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="review-rating">{t("reviews.ratingLabel")}</FieldLabel>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger id="review-rating" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATINGS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value} / 10
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="review-body">{t("reviews.bodyLabel")}</FieldLabel>
          <Textarea
            id="review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("reviews.bodyPlaceholder")}
            rows={4}
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={upsert.isPending}>
          {existing ? t("reviews.update") : t("reviews.submit")}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => toast.success(t("reviews.deleted")),
              })
            }
          >
            {t("reviews.delete")}
          </Button>
        )}
      </div>
    </form>
  );
}
