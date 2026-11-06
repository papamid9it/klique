import { withApi } from "@/server/http/api";
import { guessPlace } from "@/server/services/place-guess";

/** Where this person seems to be, to fill in sign-up (they can change it). Nothing is stored. */
export const GET = withApi({ auth: "none" }, async ({ req }) => guessPlace(req.headers));
