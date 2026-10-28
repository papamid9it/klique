/** "Ada is typing…", "Ada and Tobi are typing…", "Several people are typing…" with three bobbing dots; empty: nothing. */
export function TypingLine({ names, className }: { names: string[]; className?: string }) {
  const first = (n: string) => n.split(" ")[0] || n;
  const text = !names.length ? "" : names.length === 1 ? `${first(names[0])} is typing` : names.length === 2 ? `${first(names[0])} and ${first(names[1])} are typing` : "Several people are typing";
  return (
    // the line keeps its height either way, so the chat above doesn't jump when someone starts or stops
    <div aria-live="polite" className={`flex h-5 items-center gap-1.5 text-[12px] text-ink-muted ${className ?? ""}`}>
      {text && (
        <>
          <span aria-hidden="true" className="inline-flex items-end gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-[5px] animate-bounce rounded-full bg-ink-muted" style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }} />
            ))}
          </span>
          <span className="truncate">
            <span className="font-medium text-ink">{text.replace(/ (is|are) typing$/, "")}</span>
            {text.match(/ (is|are) typing$/)?.[0] ?? ""}…
          </span>
        </>
      )}
    </div>
  );
}
