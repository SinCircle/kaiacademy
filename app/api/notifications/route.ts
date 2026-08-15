import { requireMember } from "../../../db/auth";
import { groupedNotifications, markNotificationGroupRead } from "../../../db/queries";
import { asString } from "../../../db/runtime";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../_shared";
import { publishSyncInvalidation } from "../../../db/sync";

export async function GET(request: Request) {
  try {
    return cachedJsonResponse(request, await groupedNotifications(await requireMember(request)));
  } catch (error) {
    return apiError(error, "暂时无法读取动态");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const payload = await request.json() as Record<string, unknown>;
    const targetType = asString(payload.targetType, 20) || "problem";
    const targetId = asString(payload.targetId ?? payload.problemId, 100);
    if (!targetId || !["problem", "playground"].includes(targetType)) return Response.json({ message: "动态目标无效" }, { status: 400 });
    await markNotificationGroupRead(targetType, targetId, member);
    await publishSyncInvalidation(["/api/notifications"]);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error, "更新动态状态失败");
  }
}
