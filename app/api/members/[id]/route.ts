import { requireMember } from "../../../../db/auth";
import { getMemberProfile, updateMemberProfile } from "../../../../db/queries";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../../_shared";
import { publishSyncInvalidation } from "../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const viewer = await requireMember(request);
    const { id } = await context.params;
    return cachedJsonResponse(request, await getMemberProfile(id === "me" ? viewer.id : id, viewer));
  } catch (error) {
    return apiError(error, "暂时无法读取个人资料");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const viewer = await requireMember(request);
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action !== "profile") return Response.json({ message: "不支持的个人资料操作" }, { status: 400 });
    const memberId = id === "me" ? viewer.id : id;
    const result = await updateMemberProfile(memberId, viewer, payload);
    await publishSyncInvalidation([`/api/members/${memberId}`, "/api/members/me", "/api/session", "/api/problems", "/api/admin/members"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "修改个人资料失败");
  }
}
