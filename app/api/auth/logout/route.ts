import { clearedSessionCookie, logout } from "../../../../db/auth";
import { apiError, assertSameOrigin } from "../../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await logout(request);
    return Response.json({ ok: true }, { headers: { "Set-Cookie": clearedSessionCookie(request) } });
  } catch (error) {
    return apiError(error, "退出失败，请稍后重试");
  }
}
