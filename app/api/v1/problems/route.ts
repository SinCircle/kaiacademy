import { listProblems } from "../../../../db/queries";
import { submitApiRequest } from "../../../../db/api-access";
import { apiTags, apiText, pendingResponse, readApiJson, withApiKey } from "../_shared";

export async function GET(request: Request) {
  return withApiKey(request, "read", async ({ member }) => {
    const params = new URL(request.url).searchParams;
    const problems = await listProblems({ query: params.get("q") ?? "", viewerId: member.id, viewerRole: member.role });
    return Response.json({ problems });
  });
}

export async function POST(request: Request) {
  return withApiKey(request, "create_problem", async ({ keyId, member }) => {
    const payload = await readApiJson(request, ["title", "body", "background", "tags"]);
    return pendingResponse(await submitApiRequest(keyId, member, "create_problem", null, {
      title: apiText(payload, "title", 140),
      body: apiText(payload, "body", 30_000),
      background: apiText(payload, "background", 20_000, true),
      tags: apiTags(payload),
    }));
  });
}
