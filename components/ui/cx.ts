/** Tiny className joiner: cx("a", cond && "b", undefined) -> "a b" */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
