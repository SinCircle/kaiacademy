import { ApiScopeViolationError, readProblemForApi, submitApiRequest } from "../../../../../db/api-access";
import { AuthError } from "../../../../../db/auth";
import { database } from "../../../../../db/runtime";
import { apiTags, apiText, pendingResponse, readApiJson, withApiKey } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withApiKey(request, "read", async () => {
    const { id } = await context.params;
    return Response.json({ problem: await readProblemForApi(id) });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApiKey(request, "update_own_problem", async ({ keyId, member }) => {
    const { id } = await context.params;
    const owner = await database().prepare("SELECT creator_id AS creatorId,updated_at AS updatedAt FROM problems WHERE id = ? AND is_hidden = 0")
      .bind(id).first<{ creatorId: string; updatedAt: string }>();
    if (!owner) throw new AuthError("难题不存在", 404);
    if (owner.creatorId !== member.id) throw new ApiScopeViolationError("只能修改自己创建的难题", "尝试修改其他用户创建的难题");
    const payload = await readApiJson(request, ["title", "body", "background", "tags", "status", "baseUpdatedAt"]);
    const baseUpdatedAt = apiText(payload, "baseUpdatedAt", 40);
    if (baseUpdatedAt !== owner.updatedAt) throw new AuthError("难题已更新，请重新读取后再提交修改", 409);
    const status = apiText(payload, "status", 20);
    if (status !== "开放" && status !== "已解决") throw new AuthError("status 只能是“开放”或“已解决”", 400);
    return pendingResponse(await submitApiRequest(keyId, member, "update_own_problem", id, {
      title: apiText(payload, "title", 140),
      body: apiText(payload, "body", 30_000),
      background: apiText(payload, "background", 20_000, true),
      tags: apiTags(payload),
      status,
      baseUpdatedAt,
    }));
  });
}
