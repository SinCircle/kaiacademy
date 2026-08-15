import { ApiScopeViolationError, authenticateApiKey, logApiCall, recordApiScopeViolation } from "../../../db/api-access";
import type { ApiPermission } from "../../../db/api-contract";
import { assertApiGloballyEnabled } from "../../../db/api-control";
import { AuthError } from "../../../db/auth";
import { apiError } from "../_shared";

export async function readApiJson(request: Request, allowedFields: readonly string[]) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new AuthError("JSON 格式无效，请检查引号和反斜杠是否已正确转义", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthError("请求体必须是 JSON 对象", 400);
  }
  const payload = value as Record<string, unknown>;
  const unsupported = Object.keys(payload).filter((field) => !allowedFields.includes(field));
  if (unsupported.length) throw new AuthError(`不支持字段：${unsupported.join("、")}`, 400);
  return payload;
}

export function apiText(payload: Record<string, unknown>, field: string, maximum: number, optional = false) {
  const value = payload[field];
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || (!optional && !value.trim())) throw new AuthError(`${field} 必须是非空字符串`, 400);
  if (value.length > maximum) throw new AuthError(`${field} 超过长度限制`, 400);
  return value;
}

export function apiTags(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.tags) || !payload.tags.length || payload.tags.length > 8) throw new AuthError("tags 必须包含 1–8 个标签", 400);
  if (payload.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 24)) throw new AuthError("每个标签必须是长度不超过 24 字的非空字符串", 400);
  return [...new Set(payload.tags.map((tag) => (tag as string).trim().replace(/\s+/g, " ")))];
}

export function apiOptionalTags(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.tags) || payload.tags.length > 8) throw new AuthError("tags 必须是包含 0–8 个标签的数组", 400);
  if (payload.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 30)) throw new AuthError("每个标签必须是长度不超过 30 字的非空字符串", 400);
  return [...new Set(payload.tags.map((tag) => (tag as string).trim().replace(/\s+/g, " ")))];
}

export async function withApiKey(
  request: Request,
  permission: ApiPermission | readonly ApiPermission[],
  handler: (context: Awaited<ReturnType<typeof authenticateApiKey>>) => Promise<Response>,
) {
  let context: Awaited<ReturnType<typeof authenticateApiKey>> | null = null;
  try {
    await assertApiGloballyEnabled();
    context = await authenticateApiKey(request, permission);
    const response = await handler(context);
    await logApiCall({ keyId: context.keyId, memberId: context.member.id, method: request.method, path: new URL(request.url).pathname, statusCode: response.status, requestId: response.headers.get("x-api-request-id") });
    return response;
  } catch (error) {
    if (context && error instanceof ApiScopeViolationError) await recordApiScopeViolation(context.keyId, context.member.id, error.reason);
    const response = apiError(error, "API 请求失败");
    if (context) await logApiCall({ keyId: context.keyId, memberId: context.member.id, method: request.method, path: new URL(request.url).pathname, statusCode: response.status });
    return response;
  }
}

export function pendingResponse(request: { id: string; status: "pending" }) {
  return Response.json({ requestId: request.id, status: request.status, message: "请求已提交，等待账户所有者审阅" }, { status: 202, headers: { "x-api-request-id": request.id } });
}
