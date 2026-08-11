import { requireMember } from "../../../db/auth";
import { groupedNotifications, markProblemNotificationsRead } from "../../../db/queries";
import { asString } from "../../../db/runtime";
import { apiError, assertSameOrigin } from "../_shared";

export async function GET(request: Request) {
  try {
    return Response.json(await groupedNotifications(await requireMember(request)));
  } catch (error) {
    return apiError(error, "暂时无法读取动态");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const payload = await request.json() as Record<string, unknown>;
    const problemId = asString(payload.problemId, 100);
    if (!problemId) return Response.json({ message: "缺少问题编号" }, { status: 400 });
    await markProblemNotificationsRead(problemId, member);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "更新动态状态失败");
  }
}
