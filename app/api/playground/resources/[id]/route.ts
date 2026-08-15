import { requireMember } from "../../../../../db/auth";
import { downloadPlaygroundResource } from "../../../../../db/playground";
import { apiError } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return await downloadPlaygroundResource(id, await requireMember(request));
  } catch (error) {
    return apiError(error, "文件下载失败");
  }
}
