import { requireMember } from "../../../../db/auth";
import { apiPreference, setApiPreference } from "../../../../db/api-access";
import { apiError, assertSameOrigin } from "../../_shared";
import { publishSyncInvalidation } from "../../../../db/sync";

export async function GET(request: Request) {
  try {
    const member = await requireMember(request);
    return Response.json(await apiPreference(member.id));
  } catch (error) {
    return apiError(error, "暂时无法读取 API 设置");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const payload = await request.json() as { enabled?: unknown };
    const result = await setApiPreference(member, payload.enabled === true);
    await publishSyncInvalidation(["/api/session", "/api/members/me", "/api/access/"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "暂时无法修改 API 设置");
  }
}
