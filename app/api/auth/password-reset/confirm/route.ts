import { resetPassword } from "../../../../../db/password-reset";
import { AppError } from "../../../../../db/errors";
import { apiError, assertSameOrigin } from "../../../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json(await resetPassword(await request.json() as Record<string, unknown>));
  } catch (error) {
    return apiError(error instanceof SyntaxError ? new AppError("请求信息格式不正确") : error, "密码重置失败，请稍后重试");
  }
}
