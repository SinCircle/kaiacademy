import { requireMember } from "../../../../../db/auth";
import { updateApiKey } from "../../../../../db/api-access";
import { apiError, assertSameOrigin } from "../../../_shared";
import { publishSyncInvalidation } from "../../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const result = await updateApiKey(member, id, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation(["/api/access/dashboard", "/api/access/keys"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "修改 API Key 失败");
  }
}
