import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckIcon, CalendarDaysIcon, TrophyIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/states";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PlayerRows, type PlayerRow } from "./player-rows";

interface DailyState {
  day: string;
  resetsAt: string;
  total: number;
  attempt: { answered: number; score: number; finished: boolean } | null;
  question: {
    index: number;
    frame: string;
    options: Array<{ id: number; title: string; slug: string }>;
  } | null;
}
interface Answer {
  correct: boolean;
  answerId: number;
  state: DailyState;
}

export function DailyChallenge() {
  const { status, user } = useAuth();
  const client = useQueryClient();
  const key = ["games", "daily", user?.id];
  const game = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest<DailyState>("/games/daily", { signal }),
    enabled: status === "authenticated",
    staleTime: 0,
  });
  const board = useQuery({
    queryKey: ["games", "daily-board"],
    queryFn: ({ signal }) =>
      apiRequest<{ day: string; top: Array<PlayerRow & { score: number }> }>(
        "/games/daily/leaderboard",
        { signal },
      ),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Answer | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState("");
  const state = game.data;
  const question = state?.question;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      client.setQueryData(
        key,
        await apiRequest<DailyState>("/games/daily/start", { method: "POST" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось начать вызов.");
    } finally {
      setBusy(false);
    }
  };
  const choose = async (optionId: number) => {
    if (!state || !question || busy || result) return;
    setBusy(true);
    setPicked(optionId);
    setError("");
    try {
      const answer = await apiRequest<Answer>("/games/daily/answer", {
        method: "POST",
        body: { day: state.day, index: question.index, optionId },
      });
      setResult(answer);
      if (answer.state.attempt?.finished)
        void client.invalidateQueries({ queryKey: ["games", "daily-board"] });
    } catch (e) {
      setPicked(null);
      setError(e instanceof Error ? e.message : "Не удалось отправить ответ.");
      // A lost response may already have been committed, so resume the saved position.
      void game.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg">
            <CalendarDaysIcon className="size-5 text-primary" />
            Вызов дня
          </h2>
          <span className="text-xs text-muted-foreground">
            {state?.day ?? board.data?.day} · до 00:00 МСК
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          10 одинаковых кадров для всех. Одна попытка в день, за верный ответ — один
          балл. При равном счёте место общее. Можно продолжить после перезагрузки.
        </p>
        {status === "loading" ? (
          <Skeleton className="h-40" />
        ) : status !== "authenticated" ? (
          <div className="flex flex-col items-start gap-4 rounded-xl bg-secondary/60 p-5">
            <p className="text-sm">Войди, чтобы начать свою зачётную попытку.</p>
            <Button asChild>
              <Link to="/login" state={{ from: "/games/daily" }}>
                Войти и играть
              </Link>
            </Button>
          </div>
        ) : game.isError ? (
          <ErrorState onRetry={() => void game.refetch()} />
        ) : game.isPending ? (
          <Skeleton className="aspect-video rounded-xl" />
        ) : state?.attempt?.finished ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <TrophyIcon className="size-12 text-primary" />
            <h3 className="font-display text-2xl">
              {state.attempt.score} из {state.total}
            </h3>
            <p className="text-sm text-muted-foreground">
              Результат в рейтинге дня. Новый вызов появится в полночь по Москве.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setPicked(null);
                void game.refetch();
                void board.refetch();
              }}
            >
              Обновить результаты
            </Button>
          </div>
        ) : question ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span>
                Кадр {question.index + 1} из {state.total}
              </span>
              <span className="tabular-nums text-primary">
                {state.attempt?.score ?? 0} баллов
              </span>
            </div>
            <progress
              aria-label="Прогресс вызова"
              max={state.total}
              value={state.attempt?.answered ?? 0}
              className="h-1.5 w-full overflow-hidden rounded-full accent-primary"
            />
            <img
              src={imageSrc(question.frame)}
              alt="Кадр из аниме: выбери название ниже"
              className="aspect-video w-full rounded-xl bg-muted object-contain"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || Boolean(result)}
                  onClick={() => void choose(option.id)}
                  className={cn(
                    "flex min-h-14 items-center gap-2 rounded-xl border border-border bg-background/50 p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default",
                    !result && "hover:border-primary/50 hover:bg-secondary",
                    result?.answerId === option.id && "border-primary bg-primary/10",
                    result &&
                      picked === option.id &&
                      !result.correct &&
                      "border-destructive bg-destructive/10",
                  )}
                >
                  {result?.answerId === option.id ? (
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  ) : result && picked === option.id ? (
                    <XIcon className="size-4 shrink-0 text-destructive" />
                  ) : null}
                  {option.title}
                </button>
              ))}
            </div>
            {result && (
              <div
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="text-sm">
                  {result.correct ? "Верно! +1 балл" : "Правильный ответ отмечен выше"}
                </span>
                <Button
                  onClick={() => {
                    client.setQueryData(key, result.state);
                    setResult(null);
                    setPicked(null);
                  }}
                >
                  {result.state.attempt?.finished ? "Мой результат" : "Следующий кадр"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-start gap-4 py-4">
            <p className="text-sm">
              Готов проверить себя? Ошибки не завершают попытку: ответь на все 10
              вопросов.
            </p>
            <Button disabled={busy} onClick={() => void start()}>
              {busy ? "Готовим кадры…" : "Начать вызов дня"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <aside className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-display text-base">
          <TrophyIcon className="size-5 text-primary" />
          Рейтинг дня
        </h2>
        {board.isError ? (
          <ErrorState onRetry={() => void board.refetch()} />
        ) : board.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <PlayerRows
            rows={board.data.top.map((row) => ({ ...row, value: `${row.score} / 10` }))}
            currentUserId={user?.id}
            empty="Первый результат ещё впереди. Заверши вызов и открой рейтинг."
          />
        )}
        <p className="text-xs text-muted-foreground">
          Здесь появляются завершённые попытки. Результаты обновляются в течение минуты.
        </p>
      </aside>
    </section>
  );
}
