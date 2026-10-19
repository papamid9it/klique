import { redirect } from "next/navigation";

/** Groups live inside the community workspace now; keep old links working. */
export default async function GroupRedirect({ params }: { params: Promise<{ slug: string; subSlug: string }> }) {
  const { slug, subSlug } = await params;
  redirect(`/communities/${encodeURIComponent(slug)}?g=${encodeURIComponent(subSlug)}`);
}
