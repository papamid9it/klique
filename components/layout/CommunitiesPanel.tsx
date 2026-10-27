"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { PagePanel, PanelItem } from "./PagePanel";

/** The Communities page's panel (also on Saved): Home, Discover, My communities, Sponsored, Saved. */
export function CommunitiesPanel({ section }: { section: "discover" | "joined" | "sponsored" | "saved" }) {
  const { status } = useAuth();
  const authed = status === "authed";
  return (
    <PagePanel label="Communities">
      <ul className="space-y-0.5">
        <li>
          <PanelItem href="/communities" icon="search" on={section === "discover"}>
            Discover
          </PanelItem>
        </li>
        {authed && (
          <li>
            <PanelItem href="/communities?s=joined" icon="users" on={section === "joined"}>
              My communities
            </PanelItem>
          </li>
        )}
        <li>
          <PanelItem href="/communities?s=sponsored" icon="megaphone" on={section === "sponsored"}>
            Sponsored
          </PanelItem>
        </li>
        {authed && (
          <li>
            <PanelItem href="/saved" icon="bookmark" on={section === "saved"}>
              Saved
            </PanelItem>
          </li>
        )}
      </ul>
    </PagePanel>
  );
}
