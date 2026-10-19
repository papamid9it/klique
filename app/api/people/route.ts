import { readQuery, withApi } from "@/server/http/api";
import { listPeople } from "@/server/services/users.service";
import { peopleQuery } from "@/server/validators/schemas";

export const GET = withApi({ auth: "optional" }, async ({ req, viewer }) => listPeople(viewer, readQuery(req, peopleQuery)));
