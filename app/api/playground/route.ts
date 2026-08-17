import { requireMember } from "../../../db/auth";
import { createPlaygroundPost, listPlaygroundPosts, parsePlaygroundForm } from "../../../db/playground";
import { publishSyncInvalidation } from "../../../db/sync";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const member = await requireMember(request);
    const posts = await listPlaygroundPosts({
      query: url.searchParams.get("q") ?? "",
      type: url.searchParams.get("type") ?? "all",
      tag: url.searchParams.get("tag") ?? "",
      format: url.searchParams.get("format") ?? "",
      sort: url.searchParams.get("sort") ?? "updated",
      viewerId: member.id,
    });
    return cachedJsonResponse(request, { posts });
  } catch (error) {
    return apiError(error, "暂时无法读取游乐场内容");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { payload, uploads } = parsePlaygroundForm(await request.formData());
    const post = await createPlaygroundPost(member, payload, uploads);
    await publishSyncInvalidation(["/api/playground", "/api/admin/playground", "/api/members/"]);
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return apiError(error, "发布失败，请稍后重试");
  }
}
