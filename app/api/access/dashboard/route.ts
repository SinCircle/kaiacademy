import { requireMember } from "../../../../db/auth";
import { apiDashboard } from "../../../../db/api-access";
import { apiError, cachedJsonResponse } from "../../_shared";

export async function GET(request: Request) {
  try {
    const member = await requireMember(request);
    return cachedJsonResponse(request, await apiDashboard(member));
  } catch (error) {
    return apiError(error, "暂时无法读取 API 模块");
  }
}
