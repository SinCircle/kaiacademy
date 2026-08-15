import { discardApiStagedUpload, downloadApiStagedUpload } from "../../../../../db/api-playground";
import { requireMember } from "../../../../../db/auth";
import { apiError, assertSameOrigin } from "../../../_shared";
import { publishSyncInvalidation } from "../../../../../db/sync";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const member = await requireMember(request);
    const { id } = await context.params;
    return await downloadApiStagedUpload(id, member);
  } catch (error) {
    return apiError(error, "下载隔离文件失败");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const result = await discardApiStagedUpload(id, member);
    await publishSyncInvalidation(["/api/access/dashboard"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "作废隔离文件失败");
  }
}
