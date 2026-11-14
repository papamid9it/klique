/**
 * What a community has switched on. Kliques: off means nobody can start a klique in the community itself (its
 * events' kliques still work: going to an event together is what kliques are for), and the ones it has are hidden
 * from everyone but the people in them. Klique HQ starts with them off (every account is in it, so a klique "in HQ"
 * would be a klique in everything); a site admin can switch them on in its settings. Board: off hides the board and
 * stops new board posts and replies. Nothing is deleted either way, so switching back on brings it all back.
 */
export const kliquesOn = (c: { kliquesOff?: boolean | null; official?: boolean | null }) => !(c.kliquesOff ?? !!c.official);
export const boardsOn = (c: { boardsOff?: boolean | null }) => !c.boardsOff;

/** Mongo filter for the communities with kliques off (same rule as kliquesOn) */
export const KLIQUES_OFF = { $or: [{ kliquesOff: true }, { official: true, kliquesOff: { $ne: false } }] };
