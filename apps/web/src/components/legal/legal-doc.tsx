import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LEGAL_UPDATED, type LegalDocId, legalDocs, useLegalOperator } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** One document: its lead, then numbered sections (1, 1.1, 1.2…). */
export function LegalDocView({ id, className }: { id: LegalDocId; className?: string }) {
  const doc = legalDocs(useLegalOperator())[id];
  return (
    <article className={cn("flex flex-col gap-5 text-sm leading-relaxed", className)}>
      <p className="text-muted-foreground">{doc.lead}</p>
      <p className="text-xs text-muted-foreground/80">Редакция от {LEGAL_UPDATED}</p>
      <ol className="flex flex-col gap-5">
        {doc.sections.map((section, i) => (
          <li key={section.title} className="flex flex-col gap-2">
            <h3 className="font-display text-base text-foreground">
              {i + 1}. {section.title}
            </h3>
            {section.items.map((item, j) => (
              <p key={j} className="text-foreground/85">
                {item.startsWith("—") ? (
                  <span className="pl-4">{item}</span>
                ) : (
                  <>
                    <span className="mr-1.5 tabular-nums text-muted-foreground">
                      {i + 1}.{j + 1}.
                    </span>
                    {item}
                  </>
                )}
              </p>
            ))}
          </li>
        ))}
      </ol>
    </article>
  );
}

/** A document in a modal — read it without leaving the form. */
export function LegalDialog({ id, open, onOpenChange }: { id: LegalDocId; open: boolean; onOpenChange: (open: boolean) => void }) {
  const doc = legalDocs(useLegalOperator())[id];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex items-start gap-3 border-b border-[var(--accent-line-soft)] px-5 pb-3 pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <FileTextIcon className="size-4.5" />
          </span>
          <div className="min-w-0 pr-6">
            <DialogTitle className="font-display text-lg leading-tight">{doc.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">AnimeShadow · редакция от {LEGAL_UPDATED}</DialogDescription>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <LegalDocView id={id} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--accent-line-soft)] px-5 py-3">
          <Link
            to={`/legal?doc=${id}`}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3.5" />
            Все документы
          </Link>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            Понятно
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Words that open a document in a modal: «Пользовательское соглашение». */
export function LegalLink({ id, children, className }: { id: LegalDocId; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href={`/legal?doc=${id}`}
        role="button"
        onClick={(e) => {
          // Inside a <label>: open the document, don't tick the box or leave the page.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn("font-medium text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:text-primary hover:decoration-primary", className)}
      >
        {children}
      </a>
      <LegalDialog id={id} open={open} onOpenChange={setOpen} />
    </>
  );
}
