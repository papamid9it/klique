import { Fragment, useMemo, type ReactNode } from "react";
import { formatLines, hasFormat, type FormatSpan } from "@/lib/textFormat";
import { cx } from "./cx";

function Span({ s, plain }: { s: FormatSpan; plain: (text: string) => ReactNode }) {
  if (s.code) return <code className="rounded bg-ink/10 px-1 py-px font-mono text-[0.9em]">{s.text}</code>;
  const inner = plain(s.text);
  if (!s.bold && !s.italic && !s.underline && !s.strike) return <>{inner}</>;
  return <span className={cx(s.bold && "font-bold", s.italic && "italic", s.underline && s.strike ? "[text-decoration-line:underline_line-through]" : s.underline ? "underline" : s.strike && "line-through")}>{inner}</span>;
}

/** Someone's words with their formatting (lib/textFormat). `plain` draws the parts in between: links, @names, emoji. */
export function Formatted({ text, plain }: { text: string; plain: (text: string) => ReactNode }) {
  // parsed once per message, not on every render of the chat
  const lines = useMemo(() => (hasFormat(text) ? formatLines(text) : null), [text]);
  if (!lines) return <>{plain(text)}</>;
  return (
    <>
      {lines.map((line, i) => {
        const spans = line.spans.map((s, j) => <Span key={j} s={s} plain={plain} />);
        if (line.quote) return <span key={i} className="my-0.5 block border-l-[3px] border-current/30 pl-2.5 opacity-85">{spans}</span>;
        return (
          <Fragment key={i}>
            {i > 0 && !lines[i - 1].quote ? "\n" : ""}
            {spans}
          </Fragment>
        );
      })}
    </>
  );
}
