import { deleteAdminProblem, updateAdminProblem } from "../../../../../db/admin";
import { requireAdmin } from "../../../../../db/auth";
import { apiError, assertSameOrigin } from "../../../_shared";
import { publishSyncInvalidation } from "../../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const result = await updateAdminProblem(id, admin, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation([`/api/problems/${id}`, "/api/problems", "/api/admin/problems", "/api/members/", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "问题管理操作失败");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const result = await deleteAdminProblem(id, admin);
    await publishSyncInvalidation([`/api/problems/${id}`, "/api/problems", "/api/admin/problems", "/api/members/", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "删除问题失败");
  }
}
