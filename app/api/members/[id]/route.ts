import { requireMember } from "../../../../db/auth";
import { getMemberProfile, updateInviteQuota, updateMemberProfile } from "../../../../db/queries";
import { apiError, assertSameOrigin } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const viewer = await requireMember(request);
    const { id } = await context.params;
    return Response.json(await getMemberProfile(id === "me" ? viewer.id : id, viewer));
  } catch (error) {
    return apiError(error, "暂时无法读取个人资料");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const viewer = await requireMember(request);
    const { id } = await context.params;
    const payload = await request.json() as Record<string, unknown>;
    if (payload.action === "profile") return Response.json(await updateMemberProfile(id === "me" ? viewer.id : id, viewer, payload));
    return Response.json(await updateInviteQuota(id, viewer, payload.inviteQuota));
  } catch (error) {
    return apiError(error, "修改邀请额度失败");
  }
}
