import { ApiScopeViolationError, submitApiRequest } from "../../../../../../db/api-access";
import { AuthError } from "../../../../../../db/auth";
import { database } from "../../../../../../db/runtime";
import { apiText, pendingResponse, readApiJson, withApiKey } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return withApiKey(request, "create_direct_message", async ({ keyId, member }) => {
    const { id } = await context.params;
    const exists = await database().prepare("SELECT id FROM problems WHERE id = ? AND is_hidden = 0").bind(id).first<{ id: string }>();
    if (!exists) throw new AuthError("难题不存在", 404);
    const payload = await readApiJson(request, ["body", "parentId"]);
    if (Object.hasOwn(payload, "parentId")) throw new ApiScopeViolationError("API 只能添加顶层讨论，不能回复已有讨论", "尝试通过 API 回复已有讨论");
    return pendingResponse(await submitApiRequest(keyId, member, "create_direct_message", id, { body: apiText(payload, "body", 30_000) }));
  });
}
