"use client";

import { useState } from "react";
import { errorMessage } from "@/app/ApiCore";
import { TopicService } from "@/app/services/TopicService";
import { absoluteUrl } from "@/components/domain/ShareButton";
import { ConfirmModal } from "@/components/domain/space/parts";
import { useToast } from "@/components/providers/ToastProvider";
import { Dropdown, type MenuEntry } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { whatsappShareUrl } from "@/lib/format";
import type { TopicDTO } from "@/lib/types";
import { TopicFormModal } from "./TopicFormModal";

export const topicHref = (t: Pick<TopicDTO, "id" | "community" | "board">) => `/communities/${t.community.slug}?view=topics&b=${t.board.slug}&t=${t.id}`;

/**
 * The "…" menu on a topic: edit (author), pin and lock (owners/admins), copy link, delete.
 * Shows only what you may do; the server re-checks every action.
 */
export function TopicMenu({ topic, onChange, onRemoved, className }: { topic: TopicDTO; onChange: (t: TopicDTO) => void; onRemoved: () => void; className?: string }) {
  const toast = useToast();
  const slug = topic.community.slug;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function patch(p: { pinned?: boolean; locked?: boolean }, done: string) {
    try {
      const res = await TopicService.update(slug, topic.id, p);
      onChange(res.data);
      toast(done, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const items: MenuEntry[] = [
    ...(topic.canEdit ? ([{ label: "Edit topic", icon: "edit", onSelect: () => setEditing(true) }] as MenuEntry[]) : []),
    ...(topic.canModerate
      ? ([
          { label: topic.pinned ? "Unpin from top" : "Pin to top", icon: "pushpin", onSelect: () => void patch({ pinned: !topic.pinned }, topic.pinned ? "Unpinned" : "Pinned to the top") },
          { label: topic.locked ? "Unlock comments" : "Lock comments", icon: "lock", onSelect: () => void patch({ locked: !topic.locked }, topic.locked ? "Comments unlocked" : "Comments locked") },
        ] as MenuEntry[])
      : []),
    {
      label: "Share on WhatsApp",
      icon: "share",
      onSelect: () => void window.open(whatsappShareUrl(`${topic.title} · ${topic.community.name} on klique`, absoluteUrl(topicHref(topic))), "_blank", "noopener,noreferrer"),
    },
    {
      label: "Copy link",
      icon: "link",
      onSelect: () => {
        const url = absoluteUrl(topicHref(topic));
        navigator.clipboard.writeText(url).then(
          () => toast("Link copied", "success"),
          () => window.prompt("Copy this link", url),
        );
      },
    },
    ...(topic.canDelete ? ([{ type: "sep" }, { label: "Delete topic", icon: "trash", danger: true, onSelect: () => setDeleting(true) }] as MenuEntry[]) : []),
  ];

  return (
    <>
      <Dropdown
        items={items}
        label="Topic options"
        align="right"
        trigger={({ open, props }) => (
          <button {...props} aria-label="Topic options" title="Topic options" className={cx("inline-flex size-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-raised hover:text-ink", open && "bg-raised text-ink", className)}>
            <Icon name="more" size={17} />
          </button>
        )}
      />
      {editing && (
        <TopicFormModal
          slug={slug}
          communityName={topic.community.name}
          topic={topic}
          onClose={() => setEditing(false)}
          onSaved={(t) => {
            setEditing(false);
            onChange(t);
          }}
        />
      )}
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this topic?"
        description="The topic and all its comments are removed for everyone. This can't be undone."
        confirmLabel="Delete topic"
        onConfirm={async () => {
          await TopicService.remove(slug, topic.id);
          toast("Topic deleted", "success");
          onRemoved();
        }}
      />
    </>
  );
}
