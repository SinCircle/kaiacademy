import { requireMember } from "../../../../db/auth";
import { downloadMessageAttachment } from "../../../../db/message-attachments";
import { ensureDatabase } from "../../../../db/runtime";
import { apiError, assertSameOrigin } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const viewer = await requireMember(request);
    await ensureDatabase();
    const { id } = await context.params;
    return await downloadMessageAttachment(id, viewer);
  } catch (error) {
    return apiError(error, "附件下载失败");
  }
}
