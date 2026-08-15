import { requireMember } from "../../../../../../db/auth";
import { apiKeySecret, skillMarkdown } from "../../../../../../db/api-access";
import { apiError, assertSameOrigin } from "../../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const payload = await request.json() as { password?: unknown };
    const key = await apiKeySecret(member, id, payload.password);
    const requestUrl = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
    const markdown = skillMarkdown(key.name, key.secret, `${protocol}://${host}`, key.permissions);
    const safeName = key.name.replace(/[^a-zA-Z0-9_.-]/g, "-") || "gaiyuan";
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-SKILL.md"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, "下载 Skill 失败");
  }
}
