import { AuthError, register, sessionCookie } from "../../../../db/auth";
import { apiError, assertSameOrigin } from "../../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as Record<string, unknown>;
    const result = await register(payload);
    return Response.json({ member: result.member }, {
      status: 201,
      headers: { "Set-Cookie": sessionCookie(request, result.sessionId, result.expiresAt) },
    });
  } catch (error) {
    return apiError(error instanceof SyntaxError ? new AuthError("注册信息格式不正确") : error, "注册失败，请稍后重试");
  }
}
