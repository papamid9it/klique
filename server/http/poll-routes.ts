import { z } from "zod";
import { pollVoteSchema } from "../validators/schemas";
import { endPoll, getPoll, pollVoters, votePoll } from "../services/polls.service";
import { readJson, readQuery, withApi } from "./api";

/** Handlers for chat polls (`/api/polls/[id]/…`). Who may see, vote or end one depends on the chat it's in (the service checks). */
type Id = { id: string };

export const pollGet = withApi<Id, "required">({ auth: "required" }, async ({ params, viewer }) => getPoll(viewer, params.id));

export const pollVote = withApi<Id, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { answerIds } = await readJson(req, pollVoteSchema);
  return votePoll(viewer, params.id, answerIds);
});

export const pollEnd = withApi<Id, "required">({ auth: "required" }, async ({ params, viewer }) => endPoll(viewer, params.id));

const votersQuery = z.object({ answer: z.string().max(12) });
export const pollVotersGet = withApi<Id, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { answer } = readQuery(req, votersQuery);
  return pollVoters(viewer, params.id, answer);
});
