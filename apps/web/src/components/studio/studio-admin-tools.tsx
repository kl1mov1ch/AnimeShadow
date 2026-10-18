import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useStudioCatalog, type StudioIndex } from "./studio-data";
type Audit = {
  running: boolean;
  total: number;
  checked: number;
  unavailable?: boolean;
  failures: Array<{ id: string; title: string; episode: string }>;
};

export function StudioAdminTools() {
  const { user, status } = useAuth();
  const admin = status === "authenticated" && user?.role === "ADMIN";
  const catalog = useStudioCatalog();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const audit = useQuery({
    queryKey: ["studio", "hon-kon", "audit"],
    queryFn: () => apiRequest<Audit>("/studios/hon-kon/audit"),
    enabled: admin,
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
    retry: false,
  });
  if (!admin) return null;
  return (
    <details className="my-4 rounded-xl border border-border p-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">
        Управление релизами студии
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || audit.data?.running}
          onClick={() => {
            setBusy(true);
            void apiRequest<StudioIndex>("/studios/hon-kon/sync", { method: "POST" })
              .then((data) => {
                if (data.unavailable)
                  toast.error(
                    "Kodik временно не отвечает. Сохранённые релизы оставлены.",
                  );
                return client.invalidateQueries({ queryKey: ["studio", "hon-kon"] });
              })
              .catch(() => toast.error("Не удалось обновить индекс студии"))
              .finally(() => setBusy(false));
          }}
        >
          Обновить релизы
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || audit.data?.running}
          onClick={() => {
            setBusy(true);
            void apiRequest<Audit>("/studios/hon-kon/audit", { method: "POST" })
              .then((data) => client.setQueryData(["studio", "hon-kon", "audit"], data))
              .catch(() => toast.error("Не удалось запустить проверку"))
              .finally(() => setBusy(false));
          }}
        >
          Проверить все серии
        </Button>
      </div>
      {catalog.data?.index && (
        <p className="mt-3">
          {catalog.data.index.pending
            ? "Обновляем индекс Kodik…"
            : catalog.data.index.unavailable
              ? "Kodik пока недоступен. Показываем сохранённые релизы."
              : `В индексе студии: ${catalog.data.index.indexed}. Обновлено: ${catalog.data.index.updatedAt ? new Date(catalog.data.index.updatedAt).toLocaleString("ru-RU") : "ожидаем синхронизацию"}.`}
        </p>
      )}
      {audit.data && (
        <p className="mt-3" role="status">
          {audit.data.running
            ? "Проверяем потоки"
            : audit.data.unavailable
              ? "Не удалось обновить индекс перед проверкой"
              : "Проверка завершена"}
          : {audit.data.checked} / {audit.data.total}. Не ответили:{" "}
          {audit.data.failures.length}.
        </p>
      )}
      {!!audit.data?.failures.length && (
        <ul className="mt-2 grid gap-1">
          {audit.data.failures.map((failure) => (
            <li key={`${failure.id}:${failure.episode}`}>
              {failure.title} · серия {failure.episode}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
