import { currentMember, requireMember } from "../../../../db/auth";
import { isValidProblemShareToken } from "../../../../db/problem-share";
import { applyProblemAction, deleteCreatedProblem, getProblemDetail } from "../../../../db/queries";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../../_shared";
import { publishSyncInvalidation } from "../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const shareToken = new URL(request.url).searchParams.get("share");
    const publicShare = await isValidProblemShareToken(id, shareToken);
    const member = publicShare ? await currentMember(request) : await requireMember(request);
    return cachedJsonResponse(request, await getProblemDetail(id, member));
  } catch (error) {
    return apiError(error, "暂时无法读取问题详情");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    await applyProblemAction(id, member, await request.json() as Record<string, unknown>);
    await publishSyncInvalidation([`/api/problems/${id}`, "/api/problems", "/api/members/", "/api/admin/problems", "/api/notifications"]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "操作失败，请稍后重试");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const result = await deleteCreatedProblem(id, member);
    await publishSyncInvalidation([`/api/problems/${id}`, "/api/problems", "/api/members/", "/api/admin/problems", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "删除问题失败，请稍后重试");
  }
}
