import { currentMember } from "../../../db/auth";
import { apiError } from "../_shared";

export async function GET(request: Request) {
  try {
    return Response.json({ member: await currentMember(request) });
  } catch (error) {
    return apiError(error, "暂时无法读取登录状态");
  }
}
