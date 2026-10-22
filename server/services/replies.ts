import type { Types } from "mongoose";
import { stickerOf } from "@/lib/reactions";
import type { ReplyRefDTO } from "@/lib/types";

type Row = { _id: Types.ObjectId; body: string; sticker?: string | null; stickerUrl?: string | null; images?: string[]; deletedAt?: Date | null };

/** The one-line preview shown above a reply. */
function snippetOf(r: Row): string {
  if (r.deletedAt) return "Message deleted";
  const text = r.body.replace(/\s+/g, " ").trim();
  if (text) return text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text;
  if (r.sticker) return `${stickerOf(r.sticker)?.emoji ?? ""} Sticker`.trim();
  if (r.stickerUrl) return "Sticker";
  if (r.images?.length) return r.images.length > 1 ? `${r.images.length} photos` : "Photo";
  return "Message";
}

export function toReplyRef(r: Row, authorName: string): ReplyRefDTO {
  return { id: String(r._id), authorName, snippet: snippetOf(r), deleted: !!r.deletedAt };
}

/** What a chat list shows for a message that has no text (inbox preview). */
export function previewOf(r: { body: string; sticker?: string | null; stickerUrl?: string | null; images?: string[] }): string {
  if (r.body.trim()) return r.body.slice(0, 140);
  if (r.sticker) return `${stickerOf(r.sticker)?.emoji ?? ""} Sticker`.trim();
  if (r.stickerUrl) return "🖼️ Sticker";
  return r.images && r.images.length > 1 ? `📷 ${r.images.length} photos` : "📷 Photo";
}
