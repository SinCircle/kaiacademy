import { requireAdmin } from "../../../../db/auth";
import { listAdminProblems } from "../../../../db/admin";
import { apiError } from "../../_shared";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ problems: await listAdminProblems(query) });
  } catch (error) {
    return apiError(error, "暂时无法读取问题管理数据");
  }
}
