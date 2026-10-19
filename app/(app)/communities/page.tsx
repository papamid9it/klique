"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CommunitiesBrowser } from "@/components/domain/CommunitiesBrowser";
import { PageBanner, PillTabs } from "@/components/layout/PageTitle";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { isInterestId } from "@/lib/constants";

export default function CommunitiesPage() {
  const sp = useSearchParams();
  const { status } = useAuth();
  const [tab, setTab] = useState<"discover" | "joined">("discover");
  const interest = sp.get("interest");
  const active = tab === "joined" && status === "authed" ? "joined" : "discover";

  const items: { id: "discover" | "joined"; label: string }[] = [{ id: "discover", label: "Discover" }, ...(status === "authed" ? [{ id: "joined" as const, label: "Joined" }] : [])];

  return (
    <div>
      <PageBanner
        eyebrow="Communities"
        title="Find your people"
        action={
          <Button href="/communities/new" variant="ink">
            <Icon name="plus" size={16} /> Start a community
          </Button>
        }
        footer={<PillTabs label="Communities" items={items.map((t) => ({ ...t, icon: <Icon name={t.id === "joined" ? "check" : "search"} size={15} /> }))} active={active} onChange={(id) => setTab(id === "joined" ? "joined" : "discover")} />}
      >
        Skaters, runners, photographers and more, wherever you are.
      </PageBanner>
      <CommunitiesBrowser key={active} scope={active} initialInterest={isInterestId(interest) ? interest : undefined} />
    </div>
  );
}
