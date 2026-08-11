import { AuthError, login, sessionCookie } from "../../../../db/auth";
import { apiError, assertSameOrigin } from "../../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as { email?: unknown; password?: unknown; remember?: unknown };
    const result = await login(payload);
    return Response.json({ member: result.member }, {
      headers: { "Set-Cookie": sessionCookie(request, result.sessionId, result.expiresAt) },
    });
  } catch (error) {
    return apiError(error instanceof SyntaxError ? new AuthError("登录信息格式不正确") : error, "登录失败，请稍后重试");
  }
}
