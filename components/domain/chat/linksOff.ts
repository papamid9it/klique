import { createContext, useContext } from "react";

/**
 * Inside a live stream's chat nothing takes you away from the stream (like YouTube's live chat): links show as plain
 * text, link previews don't show, and any other link in a message does nothing. @names still open the profile card.
 */
export const LinksOff = createContext(false);
export const useLinksOff = () => useContext(LinksOff);
