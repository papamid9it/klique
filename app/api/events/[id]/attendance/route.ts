import { readJson, withApi } from "@/server/http/api";
import { getAttendance, setAttendance } from "@/server/services/attendance.service";
import { attendanceSchema } from "@/server/validators/schemas";

type P = { id: string };

/** "Who came?": the host's list of people going, with who they've ticked off. */
export const GET = withApi<P, "required">({ auth: "required" }, async ({ params, viewer }) => getAttendance(viewer, params.id));

/** Tick people off as came (earns them Hype), or untick them. */
export const POST = withApi<P, "required">({ auth: "required" }, async ({ req, params, viewer }) => {
  const { userIds, attended } = await readJson(req, attendanceSchema);
  return setAttendance(viewer, params.id, userIds, attended);
});
