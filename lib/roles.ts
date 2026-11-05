/**
 * Custom roles in a community (Discord-style). The owner (and people with "Manage roles") make roles with a name,
 * colour, optional emoji and permissions, ordered top to bottom: you can only act on people and roles below your
 * own highest role. Owners can do everything. The built-in "Admin" role is what "admin" has always meant
 * (Membership.role "admin"), so admins keep every power they had; its permissions can't be edited.
 */
export const PERMISSIONS = [
  { id: "manageChannels", label: "Manage channels", hint: "Create, edit, reorder and delete channels and categories." },
  { id: "manageRoles", label: "Manage roles", hint: "Create and edit roles below their own, and give them to people." },
  { id: "deleteMessages", label: "Delete messages", hint: "Remove other people's messages, posts and comments." },
  { id: "timeout", label: "Time out members", hint: "Stop someone posting for a while." },
  { id: "kick", label: "Remove members", hint: "Remove people (they can join again)." },
  { id: "ban", label: "Ban members", hint: "Remove people for good." },
  { id: "manageEvents", label: "Manage events", hint: "Approve, edit and cancel other people's events." },
  { id: "manageEmoji", label: "Manage emoji", hint: "Upload and delete the community's custom emoji." },
  { id: "mentionEveryone", label: "Mention @everyone and @here", hint: "Ping everyone, even when members can't." },
  { id: "manageWebhooks", label: "Manage webhooks and bots", hint: "Make and delete webhooks (normally the owner only)." },
  { id: "viewModLog", label: "See the moderation log", hint: "Read who removed or timed out what." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["id"];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.id);
/** what the built-in Admin role (and "admin") can do: everything except webhooks, which stay the owner's */
export const ADMIN_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((p) => p !== "manageWebhooks");
export const ROLE_CAP = 50;
/** a palette to pick from (any #rrggbb works) */
export const ROLE_COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#95a5a6", "#607d8b"];
export const isPermission = (p: string): p is Permission => (ALL_PERMISSIONS as string[]).includes(p);

/**
 * Only bots have this one, and it's kept apart from the permissions above (CommunityRole.readMessagesSince), so it never
 * shows up when people edit roles. Without it a bot gets no messages at all; slash commands and button presses still work.
 */
export const READ_MESSAGES = { id: "readMessages", label: "Read messages", hint: "See what people write in the channels it can see, from now on. It can never read older messages or private channels it isn't added to." } as const;
/** what a bot can ask for */
export const BOT_PERMISSIONS = [...PERMISSIONS.filter((p) => p.id !== "manageWebhooks"), READ_MESSAGES];
export const isBotPermission = (p: string) => BOT_PERMISSIONS.some((x) => x.id === p);
