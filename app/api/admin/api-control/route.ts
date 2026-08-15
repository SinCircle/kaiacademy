import { apiGlobalStatus, setApiGlobalStatus } from "../../../../db/api-control";
import { requireAdmin } from "../../../../db/auth";
import { publishSyncInvalidation } from "../../../../db/sync";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../../_shared";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return cachedJsonResponse(request, await apiGlobalStatus());
  } catch (error) {
    return apiError(error, "暂时无法读取 API 管理状态");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(request);
    const payload = await request.json() as { enabled?: unknown };
    if (typeof payload.enabled !== "boolean") return Response.json({ message: "API 状态无效" }, { status: 400 });
    const result = await setApiGlobalStatus(admin, payload.enabled);
    await publishSyncInvalidation(["/api/admin/api-control", "/api/access/dashboard"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "修改 API 状态失败");
  }
}
