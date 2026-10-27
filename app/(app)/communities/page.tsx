"use client";

import { useSearchParams } from "next/navigation";
import { CommunitiesBrowser } from "@/components/domain/CommunitiesBrowser";
import { SponsoredCommunity, useAds } from "@/components/domain/ads/Sponsored";
import { CommunitiesPanel } from "@/components/layout/CommunitiesPanel";
import { PageBanner, PillTabs } from "@/components/layout/PageTitle";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/States";
import { isInterestId } from "@/lib/constants";
import { softNavigate } from "@/lib/nav";

type Section = "discover" | "joined" | "sponsored";

/** The communities sponsored right now (that you're not in), on their own. */
function Sponsored() {
  const ads = useAds("communities", { count: 3 });
  if (!ads.length) {
    return (
      <EmptyState icon="megaphone" title="No sponsored communities right now">
        Communities that pay to be seen show up here, marked Sponsored.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-5 min-[540px]:grid-cols-2 lg:grid-cols-3">
      {ads.map((ad) => (
        <SponsoredCommunity key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

/**
 * The Communities page. Its left panel (CommunitiesPanel) has Home, Discover, My communities, Sponsored and Saved;
 * the sections live in the address (?s=joined, ?s=sponsored), with Discover (find communities) when there's none.
 */
export default function CommunitiesPage() {
  const sp = useSearchParams();
  const { status } = useAuth();
  const interest = sp.get("interest");
  const s = sp.get("s");
  const section: Section = s === "sponsored" ? "sponsored" : s === "joined" && status === "authed" ? "joined" : "discover";
  const go = (id: Section) => softNavigate(id === "discover" ? "/communities" : `/communities?s=${id}`);

  const items: { id: Section; label: string }[] = [
    { id: "discover", label: "Discover" },
    ...(status === "authed" ? [{ id: "joined" as const, label: "My communities" }] : []),
    { id: "sponsored", label: "Sponsored" },
  ];
  const icon = (id: Section) => <Icon name={id === "joined" ? "check" : id === "sponsored" ? "megaphone" : "search"} size={15} />;

  return (
    <div>
      <CommunitiesPanel section={section} />
      <PageBanner
        eyebrow="Communities"
        title={section === "joined" ? "My communities" : section === "sponsored" ? "Sponsored communities" : "Find your people"}
        action={
          <Button href="/communities/new" variant="ink">
            <Icon name="plus" size={16} /> Start a community
          </Button>
        }
        // the sections are in the left panel on big screens; phones and tablets keep them as tabs here
        footer={
          <div className="lg:hidden">
            <PillTabs label="Communities" items={items.map((t) => ({ ...t, icon: icon(t.id) }))} active={section} onChange={go} />
          </div>
        }
      >
        {section === "joined" ? "Everywhere you're a member." : section === "sponsored" ? "Communities paying to be seen. You're not in these yet." : "Skaters, runners, photographers and more, wherever you are."}
      </PageBanner>
      {section === "sponsored" ? <Sponsored /> : <CommunitiesBrowser key={section} scope={section} initialInterest={isInterestId(interest) ? interest : undefined} />}
    </div>
  );
}
