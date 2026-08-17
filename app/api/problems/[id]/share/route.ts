import { requireMember } from "../../../../../db/auth";
import { getOrCreateProblemShareToken } from "../../../../../db/problem-share";
import { apiError, assertSameOrigin } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    return Response.json({ token: await getOrCreateProblemShareToken(id, member) });
  } catch (error) {
    return apiError(error, "暂时无法创建分享链接");
  }
}
