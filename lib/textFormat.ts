/**
 * Bold, italic and the rest in what people write, with the same marks as Discord: **bold**, *italic*, __underline__,
 * ~~strike~~, `code`, and "> " at the start of a line for a quote. The words stay plain text, so nothing can inject code.
 * Comments on posts don't use this.
 */
export type FormatKind = "bold" | "italic" | "underline" | "strike" | "code" | "quote";

export const FORMAT_TOOLS: { id: FormatKind; label: string; hint: string }[] = [
  { id: "bold", label: "Bold", hint: "B" },
  { id: "italic", label: "Italic", hint: "I" },
  { id: "underline", label: "Underline", hint: "U" },
  { id: "strike", label: "Strikethrough", hint: "S" },
  { id: "code", label: "Code", hint: "</>" },
  { id: "quote", label: "Quote", hint: "❝" },
];

export interface FormatSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
}
export interface FormatLine {
  quote: boolean;
  spans: FormatSpan[];
}

// links, @names and #tags come first, so the marks inside them (a_b__c) stay as they are
const RX = /(https?:\/\/[^\s<]+)|(?<![\w@])([@#][\w-]+)|`([^`\n]+)`|\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)|~~(?=\S)(.+?)(?<=\S)~~|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g;

function spansOf(text: string, marks: Omit<FormatSpan, "text">, out: FormatSpan[]) {
  let last = 0;
  const plain = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && !prev.code && !prev.bold === !marks.bold && !prev.italic === !marks.italic && !prev.underline === !marks.underline && !prev.strike === !marks.strike) prev.text += t;
    else out.push({ text: t, ...marks });
  };
  for (const m of text.matchAll(RX)) {
    const at = m.index ?? 0;
    plain(text.slice(last, at));
    if (m[1] || m[2]) plain(m[0]);
    else if (m[3]) out.push({ text: m[3], ...marks, code: true });
    else if (m[4]) spansOf(m[4], { ...marks, bold: true, italic: true }, out);
    else if (m[5]) spansOf(m[5], { ...marks, bold: true }, out);
    else if (m[6]) spansOf(m[6], { ...marks, underline: true }, out);
    else if (m[7]) spansOf(m[7], { ...marks, strike: true }, out);
    else if (m[8]) spansOf(m[8], { ...marks, italic: true }, out);
    last = at + m[0].length;
  }
  plain(text.slice(last));
}

/** Quick check, so most messages skip the work. */
export const hasFormat = (text: string) => /[*_~`]|^>/m.test(text);

export function formatLines(text: string): FormatLine[] {
  return text.split("\n").map((line) => {
    const quote = /^> ?/.test(line);
    const spans: FormatSpan[] = [];
    spansOf(quote ? line.replace(/^> ?/, "") : line, {}, spans);
    return { quote, spans };
  });
}

/** The words without the marks: for previews and notifications, and for AutoMod (b**a**d is still bad). */
export function stripFormat(text: string): string {
  if (!hasFormat(text)) return text;
  return formatLines(text).map((l) => l.spans.map((s) => s.text).join("")).join("\n");
}

const MARK: Record<Exclude<FormatKind, "quote">, string> = { bold: "**", italic: "*", underline: "__", strike: "~~", code: "`" };

const starsAtEnd = (s: string) => /\*+$/.exec(s)?.[0].length ?? 0;
const starsAtStart = (s: string) => /^\*+/.exec(s)?.[0].length ?? 0;

/**
 * A tap on a formatting button: wraps what's selected, or takes the marks off if it's already wrapped; with nothing
 * selected, puts the marks in and leaves the cursor between them. Says where the selection goes next.
 */
export function applyFormat(value: string, start: number, end: number, kind: FormatKind): { value: string; start: number; end: number } {
  if (kind === "quote") {
    const from = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const to = nextBreak < 0 ? value.length : nextBreak;
    const lines = value.slice(from, to).split("\n");
    const off = lines.every((l) => l.startsWith("> "));
    const next = lines.map((l) => (off ? l.slice(2) : `> ${l}`)).join("\n");
    const shift = next.length - (to - from);
    return { value: value.slice(0, from) + next + value.slice(to), start: Math.max(from, start + (off ? -2 : 2)), end: end + shift };
  }
  const mark = MARK[kind];
  const before = value.slice(0, start);
  const picked = value.slice(start, end);
  const after = value.slice(end);
  // bold and italic share a star, so count them: 2 = bold, 1 = italic, 3 = both
  const stars = kind === "bold" || kind === "italic" ? Math.min(starsAtEnd(before), starsAtStart(after)) : 0;
  const on = kind === "bold" ? stars >= 2 : kind === "italic" ? stars % 2 === 1 : before.endsWith(mark) && after.startsWith(mark);
  if (on) {
    const n = mark.length;
    return { value: before.slice(0, -n) + picked + after.slice(n), start: start - n, end: end - n };
  }
  return { value: before + mark + picked + mark + after, start: start + mark.length, end: end + mark.length };
}
