import { listAdminMembers } from "../../../../db/admin";
import { requireSuperadmin } from "../../../../db/auth";
import { apiError } from "../../_shared";

export async function GET(request: Request) {
  try {
    await requireSuperadmin(request);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ members: await listAdminMembers(query) });
  } catch (error) {
    return apiError(error, "暂时无法读取人员管理数据");
  }
}

