import type { ReactNode } from "react";
import { REPORT_EMAIL, SUPPORT_EMAIL } from "@/lib/constants";

/** Layout pieces for /terms and /privacy: readable prose, numbered sections. */
export function LegalDoc({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="space-y-8">
      <header>
        <p className="eyebrow">Last updated {updated}</p>
        <h1 className="display mt-2 text-[clamp(2rem,5vw,2.75rem)]">{title}</h1>
        <div className="mt-4 text-[15px] leading-relaxed text-ink-muted">{intro}</div>
      </header>
      {children}
    </article>
  );
}

export function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-3 border-t border-line pt-6 text-[15px] leading-relaxed text-ink-muted [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h2 className="text-lg font-semibold text-ink">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

/** "email us at …" when a support address is set, otherwise the in-app route. */
export function Contact() {
  return SUPPORT_EMAIL ? (
    <>
      email us at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-accent-text underline">
        {SUPPORT_EMAIL}
      </a>
    </>
  ) : (
    <>contact us through the Report option in the app</>
  );
}

/** The safety address as a link (abuse, minors, non-consent, law enforcement); nothing when none is set. */
export function ReportEmail() {
  return REPORT_EMAIL ? (
    <a href={`mailto:${REPORT_EMAIL}`} className="font-medium text-accent-text underline">
      {REPORT_EMAIL}
    </a>
  ) : null;
}
