"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { CommunityService } from "@/app/services/CommunityService";
import { useToast } from "@/components/providers/ToastProvider";
import { PostTag } from "@/components/domain/feed/PostTag";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { POST_TAG_COLORS, POST_TAG_NAME_MAX, POST_TAGS_MAX } from "@/lib/postTags";
import type { CommunityDTO } from "@/lib/types";

type Draft = { id?: string; key: number; name: string; color: string };
let nextKey = 1;

/**
 * Settings → Posts → Tags: the community's own tags for posts (Reddit's flair), up to 10, each a name and a colour.
 * Members pick one when posting; a tag shows above the post's title and filters the community's posts. Renaming keeps
 * a tag on its posts; removing one takes it off them.
 */
export function PostTagsEditor({ c, onChanged }: { c: CommunityDTO; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [list, setList] = useState<Draft[]>(() => (c.postTags ?? []).map((g) => ({ id: g.id, key: nextKey++, name: g.name, color: g.color })));
  const [saving, setSaving] = useState(false);
  const shape = (l: { id?: string; name: string; color: string }[]) => JSON.stringify(l.map(({ id, name, color }) => ({ id, name: name.trim(), color })));
  const changed = shape(list) !== shape(c.postTags ?? []);
  const set = (key: number, patch: Partial<Draft>) => setList((l) => l.map((g) => (g.key === key ? { ...g, ...patch } : g)));

  async function save() {
    const clean = list.map((g) => ({ ...g, name: g.name.trim() })).filter((g) => g.name);
    setSaving(true);
    try {
      await CommunityService.update(c.slug, { postTags: clean.map(({ id, name, color }) => ({ ...(id ? { id } : {}), name, color })) });
      toast("Tags saved", "success");
      await onChanged();
      setList(clean);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {list.length === 0 && <p className="text-[13.5px] text-ink-muted">No tags yet. Add a few, like Question, Recap or Meetup.</p>}
      <ul className="space-y-3">
        {list.map((g) => (
          <li key={g.key} className="rounded-[10px] border border-line p-3">
            <div className="flex items-center gap-2">
              <input
                value={g.name}
                onChange={(e) => set(g.key, { name: e.target.value.slice(0, POST_TAG_NAME_MAX) })}
                maxLength={POST_TAG_NAME_MAX}
                placeholder="Tag name"
                aria-label="Tag name"
                className="h-10 min-w-0 flex-1 rounded-[8px] border border-line bg-raised px-3 text-[14px] outline-none focus:border-ink-muted"
              />
              {g.name.trim() && <PostTag tag={{ name: g.name.trim(), color: g.color }} className="hidden sm:inline-flex" />}
              <button type="button" aria-label={`Remove ${g.name || "this tag"}`} onClick={() => setList((l) => l.filter((x) => x.key !== g.key))} className="inline-flex size-10 items-center justify-center rounded-full text-ink-muted hover:bg-raised hover:text-danger">
                <Icon name="trash" size={16} />
              </button>
            </div>
            <div role="radiogroup" aria-label="Colour" className="mt-2.5 flex flex-wrap gap-1.5">
              {POST_TAG_COLORS.map((col) => (
                <button key={col.id} type="button" role="radio" aria-checked={g.color === col.id} aria-label={col.id} onClick={() => set(g.key, { color: col.id })} className={cx("h-7 w-9 rounded-[6px] border-2", g.color === col.id ? "border-ink" : "border-transparent")} style={{ background: col.bg }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {list.length < POST_TAGS_MAX && (
          <Button variant="secondary" size="sm" onClick={() => setList((l) => [...l, { key: nextKey++, name: "", color: POST_TAG_COLORS[l.length % POST_TAG_COLORS.length].id }])}>
            <Icon name="plus" size={15} /> Add a tag
          </Button>
        )}
        {changed && (
          <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
            Save tags
          </Button>
        )}
      </div>
    </div>
  );
}
