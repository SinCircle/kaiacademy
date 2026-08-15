import { deleteAdminMember, updateAdminMember } from "../../../../../db/admin";
import { requireSuperadmin } from "../../../../../db/auth";
import { apiError, assertSameOrigin } from "../../../_shared";
import { publishSyncInvalidation } from "../../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const admin = await requireSuperadmin(request);
    const { id } = await context.params;
    const result = await updateAdminMember(id, admin, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation([`/api/members/${id}`, "/api/members/me", "/api/session", "/api/admin/members"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "人员管理操作失败");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const admin = await requireSuperadmin(request);
    const { id } = await context.params;
    const result = await deleteAdminMember(id, admin);
    await publishSyncInvalidation([`/api/members/${id}`, "/api/members/me", "/api/session", "/api/admin/members", "/api/problems", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "删除成员失败");
  }
}
