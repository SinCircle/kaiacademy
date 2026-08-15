import { requireMember } from "../../../../../db/auth";
import { reviewApiRequest } from "../../../../../db/api-access";
import { apiError, assertSameOrigin } from "../../../_shared";
import { publishSyncInvalidation } from "../../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const payload = await request.json() as { decision?: unknown; confirmRisk?: unknown };
    if (payload.decision !== "approve" && payload.decision !== "reject") return Response.json({ message: "审阅决定无效" }, { status: 400 });
    const result = await reviewApiRequest(member, id, payload.decision, payload.confirmRisk === true);
    await publishSyncInvalidation(["/api/access/dashboard", "/api/problems", "/api/playground", "/api/admin/playground", "/api/members/", "/api/notifications"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "处理请求失败");
  }
}
