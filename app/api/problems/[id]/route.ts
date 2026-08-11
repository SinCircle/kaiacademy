import { requireMember } from "../../../../db/auth";
import { applyProblemAction, getProblemDetail } from "../../../../db/queries";
import { apiError, assertSameOrigin } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    return Response.json(await getProblemDetail(id, member));
  } catch (error) {
    return apiError(error, "暂时无法读取问题详情");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const member = await requireMember(request);
    const { id } = await context.params;
    await applyProblemAction(id, member, await request.json() as Record<string, unknown>);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "操作失败，请稍后重试");
  }
}
