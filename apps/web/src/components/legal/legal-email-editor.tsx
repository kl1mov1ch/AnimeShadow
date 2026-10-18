import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type LegalOperator, legalOperatorSchema } from "@animeshadow/shared";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { useLegalOperatorQuery } from "@/lib/legal";

/** Only mounted for an admin; the API independently checks both authentication and role. */
export function LegalEmailEditor() {
  const operator = useLegalOperatorQuery();
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const parsed = legalOperatorSchema.shape.email.safeParse(draft);
    if (!parsed.success) {
      setError("Укажите корректный адрес электронной почты.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiRequest<LegalOperator>("/admin/legal/email", {
        method: "PATCH",
        body: { email: parsed.data },
      });
      client.setQueryData(["legal-operator"], result);
      setDraft(null);
      setError(null);
      toast.success("Почта обновлена во всех документах");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить адрес.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mb-5 min-w-0 rounded-xl border border-border/60 bg-background/50 p-3">
      {draft === null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Почта для обращений · видно только администратору
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!operator.data}
            onClick={() => {
              if (!operator.data) return;
              setDraft(operator.data.email);
              setError(null);
            }}
          >
            <PencilIcon className="size-3.5" />
            Изменить почту
          </Button>
        </div>
      ) : (
        <form
          className="flex min-w-0 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor="legal-contact-email" className="text-xs font-medium">
            Почта для обращений
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="legal-contact-email"
              type="email"
              required
              maxLength={200}
              autoComplete="email"
              value={draft}
              disabled={saving}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "legal-email-error" : undefined}
              className="h-9 min-w-0 basis-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-1 sm:basis-40"
            />
            <Button size="sm" type="submit" disabled={saving}>
              {saving && <Loader2Icon className="size-3.5 animate-spin" />}Сохранить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Отмена
            </Button>
          </div>
          {error && (
            <p id="legal-email-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Этот адрес используется на странице правообладателей, в соглашении и
            контактах.
          </p>
        </form>
      )}
      {operator.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Не удалось загрузить текущую почту. Обновите страницу перед редактированием.
        </p>
      )}
    </div>
  );
}
