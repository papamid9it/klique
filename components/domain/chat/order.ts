import type { ChannelCategoryDTO, ChannelDTO, ChannelsDTO } from "@/lib/types";

/** Channels grouped by category, uncategorised ones first — the order they're shown in. */
export function orderChannels(data: ChannelsDTO) {
  const sections: { category: ChannelCategoryDTO | null; channels: ChannelDTO[] }[] = [];
  const loose = data.channels.filter((c) => !c.categoryId || !data.categories.some((k) => k.id === c.categoryId));
  if (loose.length) sections.push({ category: null, channels: loose });
  for (const category of data.categories) sections.push({ category, channels: data.channels.filter((c) => c.categoryId === category.id) });
  return sections;
}

/** The channel a community opens on: #general, else the first one in the list. */
export function defaultChannel(data: ChannelsDTO): ChannelDTO | null {
  const all = orderChannels(data).flatMap((s) => s.channels);
  return all.find((c) => c.slug === "general") ?? all[0] ?? null;
}
