import { requireAdmin } from "../../../../db/auth";
import { listAdminPlayground } from "../../../../db/playground-admin";
import { apiError, cachedJsonResponse } from "../../_shared";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return cachedJsonResponse(request, { posts: await listAdminPlayground(query) });
  } catch (error) {
    return apiError(error, "暂时无法读取游乐场管理数据");
  }
}
