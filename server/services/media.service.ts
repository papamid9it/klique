import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { cloudinaryAccount, type UploadKind } from "../env";

/**
 * Deleting our own uploads from Cloudinary once nothing points at them any more
 * (a replaced profile picture or banner, the photos and videos of a deleted message).
 *
 * Only files in one of our configured accounts AND inside the `klique/` folder are touched,
 * so sample pictures, other people's links and anything uploaded by hand are left alone.
 * Fire-and-forget: a failed delete never fails the request that caused it, it only leaves a stray file.
 */

// https://res.cloudinary.com/<cloud>/<image|video>/upload/[transformations/][v123/]klique/<folder>/<id>.<ext>
const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video)\/upload\/(.+)$/;

export interface Asset {
  cloudName: string;
  resource: "image" | "video";
  publicId: string;
}

export function parseUpload(url: string): Asset | null {
  const m = CLOUDINARY_URL.exec(url.split("?")[0]);
  if (!m) return null;
  const [, cloudName, resource, rest] = m;
  const at = rest.indexOf("klique/");
  if (at === -1) return null;
  const publicId = rest.slice(at).replace(/\.[a-z0-9]+$/i, "");
  return { cloudName, resource: resource as Asset["resource"], publicId };
}

const KINDS: UploadKind[] = ["avatar", "photo", "video"];

async function destroy(asset: Asset) {
  const account = KINDS.map(cloudinaryAccount).find((a) => a?.cloudName === asset.cloudName);
  if (!account) return; // not one of ours
  const params: Record<string, string> = { invalidate: "true", public_id: asset.publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const signature = createHash("sha1").update(toSign + account.apiSecret).digest("hex");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${account.cloudName}/${asset.resource}/destroy`, {
    method: "POST",
    body: new URLSearchParams({ ...params, api_key: account.apiKey, signature }),
  });
  const out = (await res.json().catch(() => null)) as { result?: string } | null;
  if (!res.ok || (out?.result !== "ok" && out?.result !== "not found")) {
    console.warn("[media] delete failed:", asset.publicId, res.status, out?.result);
  }
}

/** Delete these uploads once the response is on its way. Non-Cloudinary and foreign URLs are skipped. */
export function deleteUploads(urls: (string | null | undefined)[]) {
  const assets = [...new Set(urls.filter((u): u is string => !!u))].map(parseUpload).filter((a): a is Asset => !!a);
  if (!assets.length) return;
  const run = async () => {
    await Promise.all(assets.map((a) => destroy(a).catch((err: unknown) => console.warn("[media] delete failed:", a.publicId, (err as Error)?.message))));
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request (scripts)
  }
}
