import { FileTextIcon, LockIcon, MailIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/common/page-hero";
import { LegalDocView } from "@/components/legal/legal-doc";
import { OperatorEditor } from "@/components/legal/operator-editor";
import { useAuth } from "@/hooks/use-auth";
import { LEGAL_UPDATED, type LegalDocId, legalDocs, useLegalOperator } from "@/lib/legal";
import { useDocumentHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: LegalDocId; icon: typeof FileTextIcon }> = [
  { id: "terms", icon: ScaleIcon },
  { id: "privacy", icon: LockIcon },
  { id: "consent", icon: ShieldCheckIcon },
  { id: "contacts", icon: MailIcon },
];

const isDoc = (v: string | null): v is LegalDocId => TABS.some((t) => t.id === v);

/**
 * «Документы»: the user agreement (offer), the privacy policy, the consent
 * to data processing and the operator's contacts — one tab each, linkable
 * as /legal?doc=privacy (the footer, the bot and the payment provider point
 * here).
 */
export function Component() {
  const [params, setParams] = useSearchParams();
  const id: LegalDocId = isDoc(params.get("doc")) ? (params.get("doc") as LegalDocId) : "terms";
  const { user } = useAuth();
  const docs = legalDocs(useLegalOperator());
  const doc = docs[id];

  useDocumentHead({
    title: `${doc.title} — AnimeShadow`,
    description: doc.lead,
    path: `/legal?doc=${id}`,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHero icon={FileTextIcon} eyebrow="Правовая информация" title="Документы" lead={`Условия сервиса, обработка персональных данных и контакты. Редакция от ${LEGAL_UPDATED}`} />

      {user?.role === "ADMIN" && <OperatorEditor />}

      <nav aria-label="Документы" className="-mx-1 flex gap-1 overflow-x-auto rounded-xl border border-[var(--accent-line-soft)] bg-background/95 p-1 [scrollbar-width:none]">
        {TABS.map(({ id: tab, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => setParams({ doc: tab }, { replace: true })}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
              tab === id ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-primary/10 hover:text-primary",
            )}
          >
            <Icon className="size-4" />
            {docs[tab].short}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-[var(--accent-line-soft)] bg-[var(--accent-surface)] p-5 sm:p-8">
        <h2 className="mb-4 font-display text-xl leading-tight sm:text-2xl">{doc.title}</h2>
        <LegalDocView id={id} />
      </section>
    </div>
  );
}
