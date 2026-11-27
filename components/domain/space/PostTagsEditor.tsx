"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { PostTag } from "@/components/domain/feed/PostTag";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { POST_TAG_COLORS, POST_TAG_NAME_MAX, POST_TAGS_MAX, postTagColor } from "@/lib/postTags";
import type { CommunityDTO, PostTagDTO } from "@/lib/types";

/**
 * Settings → Posts → Tags: one box at the top (a name, a colour, Add), and the tags made so far below it as tag
 * shapes, left to right, wrapping. Click a tag to edit it in the box (Save, Cancel, Delete tag); its ✕ removes it.
 * Every change saves at once, so the page stays short however many tags there are (up to 10).
 */
export function PostTagsEditor({ c, onChanged }: { c: CommunityDTO; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const tags = c.postTags ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(POST_TAG_COLORS[tags.length % POST_TAG_COLORS.length].id);
  const [busy, setBusy] = useState(false);
  const full = !editing && tags.length >= POST_TAGS_MAX;

  async function saveList(next: { id?: string; name: string; color: string }[], done: string) {
    setBusy(true);
    try {
      await CommunityService.update(c.slug, { postTags: next.map(({ id, name, color }) => ({ ...(id ? { id } : {}), name, color })) });
      await onChanged();
      toast(done, "success");
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const reset = (n = tags.length) => {
    setEditing(null);
    setName("");
    setColor(POST_TAG_COLORS[n % POST_TAG_COLORS.length].id);
  };
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    const next = editing ? tags.map((g) => (g.id === editing ? { ...g, name: clean, color } : g)) : [...tags, { name: clean, color }];
    if (await saveList(next, editing ? "Tag saved" : "Tag added")) reset(next.length);
  }
  async function remove(g: PostTagDTO) {
    if (!(await confirm({ title: `Remove “${g.name}”?`, body: "Posts with this tag lose it.", confirmLabel: "Remove", danger: true }))) return;
    if ((await saveList(tags.filter((x) => x.id !== g.id), "Tag removed")) && editing === g.id) reset(tags.length - 1);
  }
  const pick = (g: PostTagDTO) => {
    if (editing === g.id) return reset();
    setEditing(g.id);
    setName(g.name);
    setColor(g.color);
  };

  return (
    <div className="space-y-4">
      {/* the one box: name, colour, Add (or Save when a tag below is being edited) */}
      <form onSubmit={(e) => void submit(e)} className={cx("space-y-3 rounded-[10px] border border-line bg-surface p-3", full && "opacity-50")}>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, POST_TAG_NAME_MAX))}
            maxLength={POST_TAG_NAME_MAX}
            disabled={full}
            placeholder={full ? `${POST_TAGS_MAX} tags is the most` : "Tag name"}
            aria-label="Tag name"
            className="h-10 min-w-0 flex-1 rounded-[6px] border border-line bg-raised px-3 text-[14px] outline-none focus:border-ink-muted"
          />
          <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!name.trim() || full}>
            {editing ? "Save" : "Add"}
          </Button>
        </div>
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
          {POST_TAG_COLORS.map((col) => (
            <button key={col.id} type="button" role="radio" aria-checked={color === col.id} aria-label={col.id} onClick={() => setColor(col.id)} className={cx("h-7 w-9 rounded-[6px] border-2", color === col.id ? "border-ink" : "border-transparent")} style={{ background: col.bg }} />
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] text-ink-muted">Looks like</span>
          <PostTag tag={{ name: name.trim() || "Tag name", color }} />
        </div>
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => reset()}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const g = tags.find((x) => x.id === editing);
                if (g) void remove(g);
              }}
            >
              Delete tag
            </Button>
          </div>
        )}
      </form>

      {/* the tags so far: left to right, wrapping; click one to edit it, ✕ to remove it */}
      {tags.length ? (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-muted">
            Your tags · {tags.length} of {POST_TAGS_MAX}
          </p>
          <ul className="flex flex-wrap gap-2.5">
            {tags.map((g) => {
              const col = postTagColor(g.color);
              return (
                <li key={g.id} className={cx("inline-flex items-center rounded-[8px]", editing === g.id && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}>
                  <button type="button" onClick={() => pick(g)} title={`Edit ${g.name}`} className="inline-flex">
                    <PostTag tag={g} />
                  </button>
                  <button type="button" onClick={() => void remove(g)} aria-label={`Remove ${g.name}`} title="Remove" className="-ml-px inline-flex h-[22px] items-center rounded-r-[5px] pr-1.5 opacity-70 hover:opacity-100" style={{ background: col.bg, color: col.ink }}>
                    <Icon name="x" size={11} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-[13.5px] text-ink-muted">No tags yet. Add a few, like Question, Recap or Meetup.</p>
      )}
    </div>
  );
}
