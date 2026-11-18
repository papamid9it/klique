import type { ChannelCategoryDTO, ChannelDTO, ChannelsDTO } from "@/lib/types";

/** Channels grouped by category, uncategorised ones first — the order they're shown in. */
export function orderChannels(data: ChannelsDTO) {
  const sections: { category: ChannelCategoryDTO | null; channels: ChannelDTO[] }[] = [];
  const loose = data.channels.filter((c) => !c.categoryId || !data.categories.some((k) => k.id === c.categoryId));
  if (loose.length) sections.push({ category: null, channels: loose });
  for (const category of data.categories) sections.push({ category, channels: data.channels.filter((c) => c.categoryId === category.id) });
  return sections;
}

/** The channel a community opens on: its main chat room (set by its admins), else #general, else the first one to talk in. */
export function defaultChannel(data: ChannelsDTO): ChannelDTO | null {
  return mainRoom(orderChannels(data).flatMap((s) => s.channels), data.mainChannel);
}

/** From channels in list order: the main chat room if set, else #general, else the first text channel, else the first. */
export function mainRoom(list: ChannelDTO[], main?: string | null): ChannelDTO | null {
  return (main ? list.find((c) => c.slug === main) : undefined) ?? list.find((c) => c.slug === "general") ?? list.find((c) => c.type === "text") ?? list[0] ?? null;
}
