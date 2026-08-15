import { listPlaygroundForApi, submitPlaygroundApiRequest } from "../../../../db/api-playground";
import { AuthError } from "../../../../db/auth";
import { apiOptionalTags, apiText, pendingResponse, readApiJson, withApiKey } from "../_shared";

function apiStringArray(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new AuthError(`${field} 必须是字符串数组`, 400);
  return value;
}

export async function GET(request: Request) {
  return withApiKey(request, "read", async ({ member }) => {
    return Response.json({ posts: await listPlaygroundForApi(member, request.url) });
  });
}

export async function POST(request: Request) {
  return withApiKey(request, "create_playground_post", async ({ keyId, member }) => {
    const payload = await readApiJson(request, ["title", "body", "tags", "uploadIds", "externalResources"]);
    const normalized = {
      title: apiText(payload, "title", 160),
      body: apiText(payload, "body", 30_000),
      tags: apiOptionalTags(payload),
      uploadIds: apiStringArray(payload, "uploadIds"),
      externalResources: payload.externalResources ?? [],
    };
    return pendingResponse(await submitPlaygroundApiRequest(keyId, member, "create_playground_post", null, normalized));
  });
}
