import { type LegalOperator, legalOperatorSchema } from "@animeshadow/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, PencilIcon, ShieldIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { useLegalOperator } from "@/lib/legal";
import { cn } from "@/lib/utils";

const STATUSES = [
  "самозанятый (плательщик налога на профессиональный доход)",
  "индивидуальный предприниматель",
  "ООО",
];

const FIELDS: Array<{ key: keyof LegalOperator; label: string; hint: string; wide?: boolean; inputMode?: "numeric" | "email" | "url" }> = [
  { key: "name", label: "ФИО или название", hint: "Иванов Иван Иванович / ООО «Тень»", wide: true },
  { key: "status", label: "Статус", hint: "Как вы оформлены — выберите или впишите", wide: true },
  { key: "inn", label: "ИНН", hint: "10 или 12 цифр", inputMode: "numeric" },
  { key: "ogrn", label: "ОГРН / ОГРНИП", hint: "Для ИП и ООО; самозанятым не нужно", inputMode: "numeric" },
  { key: "address", label: "Адрес для писем", hint: "Необязательно", wide: true },
  { key: "email", label: "Почта для обращений", hint: "Пишут по оплате, возвратам и данным", inputMode: "email" },
  { key: "telegram", label: "Telegram-канал", hint: "https://t.me/…", inputMode: "url" },
  { key: "paymentsName", label: "Платёжный сервис", hint: "Например, MulenPay" },
  { key: "paymentsUrl", label: "Сайт платёжного сервиса", hint: "https://…", inputMode: "url" },
];

/**
 * For the admin only, on /legal: the operator's details the documents name —
 * ФИО, status, ИНН, ОГРН, address, email, Telegram, the payment provider —
 * edited in place and saved to the server; every document shows them at once.
 */
export function OperatorEditor() {
  const operator = useLegalOperator();
  const client = useQueryClient();
  const [draft, setDraft] = useState<LegalOperator | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LegalOperator, string>>>({});
  const [saving, setSaving] = useState(false);
  const missing = !operator.name || !operator.inn;

  const save = async () => {
    if (!draft) return;
    const parsed = legalOperatorSchema.safeParse(draft);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof LegalOperator] = issue.message;
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      const saved = await apiRequest<LegalOperator>("/admin/legal", { method: "PUT", body: parsed.data });
      client.setQueryData(["legal-operator"], saved);
      setDraft(null);
      setErrors({});
      toast.success("Реквизиты сохранены", { description: "Документы уже показывают новые данные" });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : "Не получилось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-amber-400/30 bg-amber-500/[0.05] p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
          <ShieldIcon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base leading-tight">Реквизиты оператора</h2>
          <p className="text-xs text-muted-foreground">Видно только админу. Подставляются во все документы и окна согласия.</p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft(operator)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 text-sm font-semibold text-black transition-transform active:scale-95"
          >
            <PencilIcon className="size-3.5" />
            Изменить
          </button>
        )}
      </header>

      {!draft ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="flex min-w-0 flex-col">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className={cn("truncate", operator[key] ? "text-foreground" : "italic text-muted-foreground/60")}>{operator[key] || "не указано"}</dd>
            </div>
          ))}
          {missing && (
            <p className="text-xs text-amber-300 sm:col-span-2">
              Укажите ФИО и ИНН — без них платёжный сервис и Роскомнадзор документы не примут. Пока в текстах стоит «администрация сервиса AnimeShadow».
            </p>
          )}
        </dl>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label, hint, wide, inputMode }) => (
              <label key={key} className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
                <span className="text-xs font-medium">{label}</span>
                <input
                  value={draft[key]}
                  inputMode={inputMode}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setErrors((x) => ({ ...x, [key]: undefined }));
                  }}
                  placeholder={hint}
                  className={cn(
                    "h-10 min-w-0 rounded-xl border bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary/50",
                    errors[key] ? "border-rose-500/70" : "border-[var(--accent-line-soft)]",
                  )}
                />
                {key === "status" && (
                  <span className="flex flex-wrap gap-1.5 pt-0.5">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDraft({ ...draft, status: s })}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-[11px] transition-colors",
                          draft.status === s ? "border-primary/50 bg-primary/10 text-primary" : "border-[var(--accent-line-soft)] text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.replace(" (плательщик налога на профессиональный доход)", "")}
                      </button>
                    ))}
                  </span>
                )}
                {errors[key] && <span className="text-[11px] text-rose-400">{errors[key]}</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setErrors({});
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--accent-line-soft)] px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-4" />
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
            >
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
              Сохранить
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
