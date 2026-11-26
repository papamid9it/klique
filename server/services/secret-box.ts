import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { authSecret } from "../env";

/**
 * Keeps secrets we hold for people (their Twitch sign-in) encrypted in the database: AES-256-GCM with a key made
 * from AUTH_SECRET, so a copy of the database alone can't use them. `seal` → "v1:<iv>:<tag>:<data>" (base64url).
 */
const key = () => createHash("sha256").update(Buffer.concat([Buffer.from("klique-secret-box:"), Buffer.from(authSecret())])).digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, data] = sealed.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
