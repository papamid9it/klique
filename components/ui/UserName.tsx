import type { CSSProperties } from "react";
import { getNameEffect } from "@/lib/cosmetics";
import { cx } from "./cx";

/** A display name, drawn with the person's chosen effect (if any). Plain text otherwise. */
export function UserName({ name, effect, className }: { name: string; effect?: string | null; className?: string }) {
  const spec = getNameEffect(effect);
  if (!spec) return <span className={className}>{name}</span>;
  const [c0, c1 = c0, c2 = c1] = spec.colors;
  const style = {
    "--ms": `${spec.ms}ms`,
    "--c0": c0,
    "--c1": c1,
    "--c2": c2,
    "--g": spec.glow ?? c0,
    "--grad": `linear-gradient(90deg, ${spec.colors.join(",")})`,
    // flame colours repeated so the climb loops without a seam
    "--rise": [...spec.colors, ...spec.colors.slice(1)].join(","),
  } as CSSProperties;
  return (
    <span className={cx("kq-name", spec.mode, className)} style={style} data-text={name}>
      {name}
    </span>
  );
}
