import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LockKeyholeIcon, ArrowRightIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Keep protected children unmounted, including their queries, until auth resolves. */
export function MembersOnly({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading")
    return (
      <div
        className="mx-auto grid w-full max-w-3xl gap-4 py-12"
        role="status"
        aria-label="Проверяем вход"
      >
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-52 rounded-3xl" />
      </div>
    );
  if (status !== "authenticated")
    return (
      <section className="mx-auto my-10 flex w-full max-w-xl flex-col items-start gap-5 rounded-3xl border border-border/70 bg-card/70 p-6 sm:my-16 sm:p-9">
        <span className="grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <LockKeyholeIcon className="size-5" />
        </span>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Для участников AnimeShadow
          </p>
          <h1 className="font-display text-2xl leading-tight">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/login" state={{ from: location.pathname + location.search }}>
              Войти
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/register">Создать аккаунт</Link>
          </Button>
        </div>
      </section>
    );
  return children;
}
