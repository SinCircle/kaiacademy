import { requireMember } from "../../../../db/auth";
import { createApiKey, listApiKeys } from "../../../../db/api-access";
import { apiError, assertSameOrigin } from "../../_shared";
import { publishSyncInvalidation } from "../../../../db/sync";

export async function GET(request: Request) {
  try {
    const member = await requireMember(request);
    return Response.json({ keys: await listApiKeys(member.id) });
  } catch (error) {
    return apiError(error, "暂时无法读取 API Key");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const result = await createApiKey(member, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation(["/api/access/dashboard", "/api/access/keys"]);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, "创建 API Key 失败");
  }
}
