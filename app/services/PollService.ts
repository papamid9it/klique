import ApiClient from "@/app/ApiCore";
import type { Envelope, PollDTO, UserBrief } from "@/lib/types";

const api = new ApiClient();

/** The answers you can give when starting a poll (sent with a chat message as `poll`). */
export interface PollInput {
  question: string;
  answers: { text: string; emoji?: string }[];
  multiple: boolean;
  anonymous: boolean;
  /** how long it runs: 1, 4, 8, 24, 72 or 168 hours */
  hours: number;
}

/** Chat polls: look, vote (or change your vote), end early, see who picked what. */
export const PollService = {
  get: (id: string) => api.get<Envelope<PollDTO>>(`/api/polls/${id}`),
  vote: (id: string, answerIds: string[]) => api.post<Envelope<PollDTO>>(`/api/polls/${id}/vote`, { answerIds }),
  end: (id: string) => api.post<Envelope<PollDTO>>(`/api/polls/${id}/end`),
  voters: (id: string, answer: string) => api.get<Envelope<UserBrief[]>>(`/api/polls/${id}/voters`, { answer }),
};
