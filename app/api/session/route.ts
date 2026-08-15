import { currentMember } from "../../../db/auth";
import { apiError, cachedJsonResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    return cachedJsonResponse(request, { member: await currentMember(request) });
  } catch (error) {
    return apiError(error, "暂时无法读取登录状态");
  }
}
