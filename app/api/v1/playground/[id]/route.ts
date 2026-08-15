import { ApiScopeViolationError } from "../../../../../db/api-access";
import { readPlaygroundForApi, submitPlaygroundApiRequest } from "../../../../../db/api-playground";
import { AuthError } from "../../../../../db/auth";
import { database } from "../../../../../db/runtime";
import { apiOptionalTags, apiText, pendingResponse, readApiJson, withApiKey } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

function apiStringArray(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new AuthError(`${field} 必须是字符串数组`, 400);
  return value;
}

export async function GET(request: Request, context: RouteContext) {
  return withApiKey(request, "read", async ({ member }) => {
    const { id } = await context.params;
    return Response.json(await readPlaygroundForApi(id, member));
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withApiKey(request, "update_own_playground_post", async ({ keyId, member }) => {
    const { id } = await context.params;
    const owner = await database().prepare("SELECT author_id AS authorId,updated_at AS updatedAt FROM playground_posts WHERE id = ? AND is_hidden = 0")
      .bind(id).first<{ authorId: string; updatedAt: string }>();
    if (!owner) throw new AuthError("游乐场内容不存在", 404);
    if (owner.authorId !== member.id) throw new ApiScopeViolationError("只能修改自己创建的游乐场内容", "尝试修改其他用户创建的游乐场内容");
    const payload = await readApiJson(request, ["title", "body", "tags", "keepResourceIds", "uploadIds", "externalResources", "baseUpdatedAt"]);
    const baseUpdatedAt = apiText(payload, "baseUpdatedAt", 40);
    if (baseUpdatedAt !== owner.updatedAt) throw new AuthError("内容已更新，请重新读取后再提交修改", 409);
    const normalized = {
      title: apiText(payload, "title", 160),
      body: apiText(payload, "body", 30_000),
      tags: apiOptionalTags(payload),
      keepResourceIds: apiStringArray(payload, "keepResourceIds"),
      uploadIds: apiStringArray(payload, "uploadIds"),
      externalResources: payload.externalResources ?? [],
      baseUpdatedAt,
    };
    return pendingResponse(await submitPlaygroundApiRequest(keyId, member, "update_own_playground_post", id, normalized));
  });
}
