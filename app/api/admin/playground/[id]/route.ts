import { requireAdmin } from "../../../../../db/auth";
import { updateAdminPlayground } from "../../../../../db/playground-admin";
import { publishSyncInvalidation } from "../../../../../db/sync";
import { apiError, assertSameOrigin } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const result = await updateAdminPlayground(id, admin, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation([`/api/playground/${id}`, "/api/playground", "/api/admin/playground", "/api/members/"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "游乐场管理操作失败");
  }
}
