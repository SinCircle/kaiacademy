import { env } from "cloudflare:workers";
import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { database, ensureDatabase, jsonArray } from "./runtime";
import { constantTimeEqual, secretDigest } from "./security";
import { publishSyncInvalidation } from "./sync";
import { normalizeApiPermissions, type ApiPermission, type ApiWriteAction } from "./api-contract";
import { apiGlobalStatus } from "./api-control";
import { applyPlaygroundApiRequest, disposeApiRequestUploads, listApiStagedUploads } from "./api-playground";
export { skillMarkdown } from "./api-contract";

type KeyRow = {
  id: string;
  memberId: string;
  name: string;
  secretHash: string;
  encryptedSecret: string;
  secretIv: string;
  secretSuffix: string;
  permissions: string;
  status: "active" | "isolated" | "revoked";
  scopeViolationCount: number;
  lastScopeViolationAt: string | null;
  isolatedAt: string | null;
  isolationReason: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export class ApiScopeViolationError extends AuthError {
  reason: string;

  constructor(message: string, reason: string) {
    super(message, 403);
    this.reason = reason;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encryptionSecret() {
  const configured = (env as unknown as { API_KEY_ENCRYPTION_SECRET?: string }).API_KEY_ENCRYPTION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  // Local development fallback. Hosted environments must configure a private secret.
  return "gaiyuan-local-api-key-encryption-only-2026";
}

async function encryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { encryptedSecret: bytesToBase64(new Uint8Array(encrypted)), secretIv: bytesToBase64(iv) };
}

async function decryptSecret(value: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(value));
  return new TextDecoder().decode(decrypted);
}

async function hashApiSecret(value: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function apiQualification(memberId: string) {
  await ensureDatabase();
  const row = await database().prepare("SELECT EXISTS(SELECT 1 FROM messages WHERE author_id = ?) AS qualified")
    .bind(memberId).first<{ qualified: number }>();
  return Boolean(row?.qualified);
}

export async function apiPreference(memberId: string) {
  await ensureDatabase();
  const [member, qualified] = await Promise.all([
    database().prepare("SELECT api_enabled AS apiEnabled FROM members WHERE id = ?").bind(memberId).first<{ apiEnabled: number }>(),
    apiQualification(memberId),
  ]);
  return { qualified, enabled: qualified && Boolean(member?.apiEnabled) };
}

export async function setApiPreference(member: SessionMember, enabled: boolean) {
  const qualified = await apiQualification(member.id);
  if (!qualified) throw new AuthError("请先在难题板块参与一次讨论", 403);
  await database().prepare("UPDATE members SET api_enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, member.id).run();
  return { qualified, enabled };
}

export async function listApiKeys(memberId: string) {
  await ensureDatabase();
  const rows = await database().prepare(`SELECT id,name,secret_suffix AS secretSuffix,permissions,status,
      scope_violation_count AS scopeViolationCount,last_scope_violation_at AS lastScopeViolationAt,
      isolated_at AS isolatedAt,isolation_reason AS isolationReason,
      expires_at AS expiresAt,last_used_at AS lastUsedAt,created_at AS createdAt
    FROM api_keys WHERE member_id = ? ORDER BY created_at DESC`)
    .bind(memberId).all<Omit<KeyRow, "memberId" | "secretHash" | "encryptedSecret" | "secretIv">>();
  return rows.results.map((key) => ({ ...key, permissions: normalizeApiPermissions(jsonArray(key.permissions)) }));
}

export async function createApiKey(member: SessionMember, input: { name: unknown; expiresAt?: unknown; permissions?: unknown }) {
  const preference = await apiPreference(member.id);
  if (!preference.enabled) throw new AuthError("请先在个人页面启用 API", 403);
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  if (!name || !/^[\p{L}\p{N}_.-]{2,40}$/u.test(name)) throw new AuthError("名称需为 2–40 位文字、数字、点、下划线或连字符");
  const expiresAt = typeof input.expiresAt === "string" && input.expiresAt ? input.expiresAt : null;
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) throw new AuthError("到期时间无效");
  const raw = new Uint8Array(24);
  crypto.getRandomValues(raw);
  const secret = `gai_sk_live_${Array.from(raw, (byte) => byte.toString(36).padStart(2, "0")).join("")}`;
  const encrypted = await encryptSecret(secret);
  const id = `api-key-${crypto.randomUUID()}`;
  try {
    await database().prepare(`INSERT INTO api_keys
      (id,member_id,name,secret_hash,encrypted_secret,secret_iv,secret_suffix,permissions,status,expires_at,last_used_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,'active',?,NULL,?)`)
      .bind(id, member.id, name, await hashApiSecret(secret), encrypted.encryptedSecret, encrypted.secretIv, secret.slice(-4), JSON.stringify(normalizeApiPermissions(input.permissions ?? ["manage_pending_requests"])), expiresAt, new Date().toISOString()).run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) throw new AuthError("已经存在同名 API Key", 409);
    throw error;
  }
  return { id };
}

export async function updateApiKey(member: SessionMember, keyId: string, input: { permissions?: unknown; status?: unknown }) {
  const row = await database().prepare("SELECT id,status,permissions FROM api_keys WHERE id = ? AND member_id = ?").bind(keyId, member.id).first<{ id: string; status: KeyRow["status"]; permissions: string }>();
  if (!row) throw new AuthError("API Key 不存在", 404);
  const recovering = input.status === "active" && row.status === "isolated";
  const status: KeyRow["status"] = input.status === "revoked" ? "revoked" : recovering ? "active" : row.status;
  const permissions = input.permissions === undefined ? row.permissions : JSON.stringify(normalizeApiPermissions(input.permissions));
  await database().prepare(`UPDATE api_keys SET permissions = ?, status = ?,
      scope_violation_count = CASE WHEN ? = 'active' THEN 0 ELSE scope_violation_count END,
      last_scope_violation_at = CASE WHEN ? = 'active' THEN NULL ELSE last_scope_violation_at END,
      isolated_at = CASE WHEN ? = 'active' THEN NULL ELSE isolated_at END,
      isolation_reason = CASE WHEN ? = 'active' THEN NULL ELSE isolation_reason END,
      encrypted_secret = CASE WHEN ? = 'revoked' THEN '' ELSE encrypted_secret END,
      secret_iv = CASE WHEN ? = 'revoked' THEN '' ELSE secret_iv END
    WHERE id = ? AND member_id = ?`)
    .bind(permissions, status, status, status, status, status, status, status, keyId, member.id).run();
  return { ok: true, status };
}

export async function recordApiScopeViolation(keyId: string, memberId: string, reason: string) {
  const db = database();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
  const normalizedReason = reason.trim().slice(0, 200) || "超出授权范围";
  await db.prepare(`UPDATE api_keys SET
      scope_violation_count = CASE WHEN last_scope_violation_at >= ? THEN scope_violation_count + 1 ELSE 1 END,
      last_scope_violation_at = ?,
      status = CASE WHEN (CASE WHEN last_scope_violation_at >= ? THEN scope_violation_count + 1 ELSE 1 END) >= 3 THEN 'isolated' ELSE status END,
      isolated_at = CASE WHEN (CASE WHEN last_scope_violation_at >= ? THEN scope_violation_count + 1 ELSE 1 END) >= 3 THEN ? ELSE isolated_at END,
      isolation_reason = CASE WHEN (CASE WHEN last_scope_violation_at >= ? THEN scope_violation_count + 1 ELSE 1 END) >= 3 THEN ? ELSE isolation_reason END
    WHERE id = ? AND member_id = ? AND status = 'active'`)
    .bind(cutoff, nowIso, cutoff, cutoff, nowIso, cutoff, normalizedReason, keyId, memberId).run();
  await publishSyncInvalidation(["/api/access/dashboard"]);
}

export async function verifyAccountPassword(memberId: string, password: unknown) {
  const value = typeof password === "string" ? password : "";
  const row = await database().prepare("SELECT password_salt AS salt,password_hash AS hash FROM members WHERE id = ?")
    .bind(memberId).first<{ salt: string; hash: string }>();
  if (!row || !value) throw new AuthError("账户密码不正确", 401);
  const digest = await secretDigest(value, row.salt);
  if (!constantTimeEqual(digest, row.hash)) throw new AuthError("账户密码不正确", 401);
}

export async function apiKeySecret(member: SessionMember, keyId: string, password: unknown) {
  await verifyAccountPassword(member.id, password);
  const row = await database().prepare(`SELECT encrypted_secret AS encryptedSecret,secret_iv AS secretIv,name,status,permissions,expires_at AS expiresAt
    FROM api_keys WHERE id = ? AND member_id = ?`).bind(keyId, member.id).first<Pick<KeyRow, "encryptedSecret" | "secretIv" | "name" | "status" | "permissions" | "expiresAt">>();
  if (!row || row.status !== "active" || (row.expiresAt && Date.parse(row.expiresAt) <= Date.now())) throw new AuthError("API Key 不可用", 404);
  return { name: row.name, secret: await decryptSecret(row.encryptedSecret, row.secretIv), permissions: normalizeApiPermissions(jsonArray(row.permissions)) };
}

export async function authenticateApiKey(request: Request, permission: ApiPermission | readonly ApiPermission[]) {
  await ensureDatabase();
  const authorization = request.headers.get("authorization") ?? "";
  const secret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret) throw new AuthError("缺少 API Key", 401);
  const row = await database().prepare(`SELECT key.id,key.member_id AS memberId,key.permissions,key.status,key.expires_at AS expiresAt,
      member.api_enabled AS apiEnabled,member.email,member.username,member.display_name AS displayName,member.initials,member.role,
      member.account_status AS accountStatus,member.avatar_updated_at AS avatarUpdatedAt,member.invite_quota AS inviteQuota,member.created_at AS createdAt
      ,EXISTS(SELECT 1 FROM messages api_message WHERE api_message.author_id = member.id) AS apiQualified
    FROM api_keys key JOIN members member ON member.id = key.member_id WHERE key.secret_hash = ?`)
    .bind(await hashApiSecret(secret)).first<KeyRow & SessionMember & { apiEnabled: number }>();
  if (row?.status === "isolated") throw new AuthError("API Key 已隔离，请在 API 页面恢复后重试", 423);
  if (!row || row.status !== "active" || row.accountStatus !== "active" || !row.apiEnabled || !row.apiQualified || (row.expiresAt && Date.parse(row.expiresAt) <= Date.now())) {
    throw new AuthError("API Key 无效或已停用", 401);
  }
  const permissions = normalizeApiPermissions(jsonArray(row.permissions));
  const acceptedPermissions = Array.isArray(permission) ? permission : [permission];
  if (!acceptedPermissions.some((candidate) => permissions.includes(candidate))) {
    await recordApiScopeViolation(row.id, row.memberId, `尝试使用未授权权限：${acceptedPermissions.join("/")}`);
    throw new AuthError("API Key 没有此项权限", 403);
  }
  const member: SessionMember = { id: row.memberId, email: row.email, username: row.username, displayName: row.displayName, initials: row.initials, role: row.role, accountStatus: row.accountStatus, avatarUpdatedAt: row.avatarUpdatedAt, inviteQuota: Number(row.inviteQuota), apiEnabled: true, apiQualified: true, createdAt: row.createdAt };
  await database().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  return { keyId: row.id, member, permissions };
}

export async function logApiCall(input: { keyId: string; memberId: string; method: string; path: string; statusCode: number; requestId?: string | null }) {
  await database().prepare("INSERT INTO api_call_logs (id,api_key_id,member_id,method,path,status_code,request_id,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(`api-log-${crypto.randomUUID()}`, input.keyId, input.memberId, input.method, input.path, input.statusCode, input.requestId ?? null, new Date().toISOString()).run();
  await publishSyncInvalidation(["/api/access/dashboard"]);
}

export async function submitApiRequest(keyId: string, member: SessionMember, action: ApiWriteAction, problemId: string | null, payload: unknown) {
  const id = `api-request-${crypto.randomUUID()}`;
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > 100_000) throw new AuthError("请求内容过大", 413);
  const db = database();
  const duplicate = await db.prepare(`SELECT id FROM api_requests
    WHERE member_id = ? AND action = ? AND COALESCE(problem_id, '') = COALESCE(?, '') AND payload = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1`).bind(member.id, action, problemId, serialized).first<{ id: string }>();
  if (duplicate) return { id: duplicate.id, status: "pending" as const };
  if (action === "update_own_problem" && problemId) {
    const pendingForProblem = await db.prepare("SELECT id FROM api_requests WHERE member_id = ? AND action = 'update_own_problem' AND problem_id = ? AND status = 'pending' LIMIT 1")
      .bind(member.id, problemId).first<{ id: string }>();
    if (pendingForProblem) throw new AuthError("这个难题已有一条待处理修改，请先处理后再提交", 409);
  }
  const inserted = await db.prepare(`INSERT INTO api_requests
    (id,api_key_id,member_id,action,problem_id,payload,status,result_id,error,created_at,reviewed_at)
    SELECT ?,?,?,?,?,?,'pending',NULL,NULL,?,NULL
    WHERE (SELECT COUNT(*) FROM api_requests WHERE member_id = ? AND status = 'pending') < 64`)
    .bind(id, keyId, member.id, action, problemId, serialized, new Date().toISOString(), member.id).run();
  if (!inserted.meta.changes) throw new AuthError("账户已有 64 条待处理请求，请先完成审批", 429);
  return { id, status: "pending" as const };
}

export async function listPendingApiRequestsForKey(keyId: string, memberId: string) {
  await ensureDatabase();
  const rows = await database().prepare(`SELECT id,action,problem_id AS problemId,playground_post_id AS playgroundPostId,
      payload,created_at AS createdAt
    FROM api_requests
    WHERE api_key_id = ? AND member_id = ? AND status = 'pending'
    ORDER BY created_at DESC`)
    .bind(keyId, memberId).all<{
      id: string;
      action: ApiWriteAction;
      problemId: string | null;
      playgroundPostId: string | null;
      payload: string;
      createdAt: string;
    }>();
  return rows.results.map((row) => ({
    requestId: row.id,
    action: row.action,
    problemId: row.problemId,
    playgroundPostId: row.playgroundPostId,
    content: JSON.parse(row.payload) as unknown,
    createdAt: row.createdAt,
  }));
}

export async function withdrawPendingApiRequest(keyId: string, memberId: string, requestId: string) {
  await ensureDatabase();
  const db = database();
  await db.prepare("UPDATE api_requests SET status = 'pending', reviewed_at = NULL WHERE status LIKE 'processing-%' AND reviewed_at < ?")
    .bind(new Date(Date.now() - 10 * 60_000).toISOString()).run();
  const request = await db.prepare(`SELECT id,action,status FROM api_requests
    WHERE id = ? AND api_key_id = ? AND member_id = ?`)
    .bind(requestId, keyId, memberId).first<{ id: string; action: ApiWriteAction; status: string }>();
  if (!request) throw new AuthError("待处理请求不存在", 404);
  if (request.status !== "pending") throw new AuthError("这个请求已经处理，不能撤回", 409);

  const withdrawnAt = new Date().toISOString();
  const claimToken = `processing-withdraw-${crypto.randomUUID()}`;
  await db.prepare(`UPDATE api_requests SET status = ?, reviewed_at = ?
    WHERE id = ? AND api_key_id = ? AND member_id = ? AND status = 'pending'`)
    .bind(claimToken, withdrawnAt, requestId, keyId, memberId).run();
  const claimed = await db.prepare("SELECT status FROM api_requests WHERE id = ? AND api_key_id = ? AND member_id = ?")
    .bind(requestId, keyId, memberId).first<{ status: string }>();
  if (claimed?.status !== claimToken) throw new AuthError("这个请求正在处理或已经处理", 409);

  try {
    if (request.action === "create_playground_post" || request.action === "update_own_playground_post") {
      await disposeApiRequestUploads(requestId);
    }
    await db.prepare(`UPDATE api_requests SET status = 'rejected', error = ?, reviewed_at = ?
      WHERE id = ? AND status = ?`)
      .bind("由 API Key 主动撤回", withdrawnAt, requestId, claimToken).run();
  } catch (error) {
    await db.prepare(`UPDATE api_requests SET status = 'pending', error = NULL, reviewed_at = NULL
      WHERE id = ? AND status = ?`).bind(requestId, claimToken).run();
    throw error;
  }
  await publishSyncInvalidation(["/api/access/dashboard"]);
  return { requestId, deleted: true };
}

function apiUpdateRiskFlags(payload: Record<string, unknown>, current: { title: string; body: string; background: string; status: string; tags: string[] }) {
  const nextTitle = typeof payload.title === "string" ? payload.title : current.title;
  const nextBody = typeof payload.body === "string" ? payload.body : current.body;
  const nextBackground = typeof payload.background === "string" ? payload.background : current.background;
  const nextStatus = typeof payload.status === "string" ? payload.status : current.status;
  const nextTags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : current.tags;
  const flags: string[] = [];
  if (current.body.length >= 80 && nextBody.length * 2 < current.body.length) flags.push("正文大幅删减");
  if (current.background.length >= 80 && nextBackground.length * 2 < current.background.length) flags.push("背景大幅删减");
  if (current.tags.some((tag) => !nextTags.includes(tag))) flags.push("移除已有标签");
  if (nextStatus !== current.status) flags.push("改变问题状态");
  const changedSections = [nextTitle !== current.title, nextBody !== current.body, nextBackground !== current.background, nextStatus !== current.status, nextTags.join("\u0000") !== current.tags.join("\u0000")].filter(Boolean).length;
  if (changedSections >= 4) flags.push("整体重写");
  return flags;
}

function apiPlaygroundUpdateRiskFlags(payload: Record<string, unknown>, current: { body: string; tags: string[]; resources: Array<{ id: string }> }) {
  const nextBody = typeof payload.body === "string" ? payload.body : current.body;
  const nextTags = Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is string => typeof tag === "string") : current.tags;
  const keepResourceIds = Array.isArray(payload.keepResourceIds) ? payload.keepResourceIds.filter((id): id is string => typeof id === "string") : current.resources.map((resource) => resource.id);
  const flags: string[] = [];
  if (current.body.length >= 80 && nextBody.length * 2 < current.body.length) flags.push("正文大幅删减");
  if (current.tags.some((tag) => !nextTags.includes(tag))) flags.push("移除已有标签");
  if (current.resources.some((resource) => !keepResourceIds.includes(resource.id))) flags.push("移除已有资源");
  return flags;
}

export async function apiDashboard(member: SessionMember) {
  await ensureDatabase();
  const db = database();
  const [preference, globalControl, keys, requests, logs, stagedUploads] = await Promise.all([
    apiPreference(member.id),
    apiGlobalStatus(),
    listApiKeys(member.id),
    db.prepare(`SELECT request.id,request.action,request.problem_id AS problemId,request.playground_post_id AS playgroundPostId,request.payload,request.status,
        request.result_id AS resultId,request.error,request.created_at AS createdAt,request.reviewed_at AS reviewedAt,
        key.name AS keyName,problem.short_code AS shortCode,problem.title AS problemTitle,
        problem.body AS currentBody,problem.background AS currentBackground,problem.status AS currentStatus,
        problem.creator_id AS problemCreatorId,
        COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM problem_tags WHERE problem_id = problem.id), '') AS currentTags,
        playground.title AS playgroundTitle,playground.body AS currentPlaygroundBody,playground.updated_at AS currentPlaygroundUpdatedAt,
        COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM playground_tags WHERE post_id = playground.id), '') AS currentPlaygroundTags,
        COALESCE((SELECT json_group_array(json_object('id',resource.id,'kind',resource.kind,'displayName',resource.display_name,
          'description',resource.description,'mimeType',resource.mime_type,'byteSize',resource.byte_size,'externalUrl',resource.external_url))
          FROM playground_resources resource WHERE resource.post_id = playground.id), '[]') AS currentPlaygroundResources
      FROM api_requests request
      JOIN api_keys key ON key.id = request.api_key_id
      LEFT JOIN problems problem ON problem.id = request.problem_id
      LEFT JOIN playground_posts playground ON playground.id = request.playground_post_id
      WHERE request.member_id = ?
      ORDER BY CASE request.status WHEN 'pending' THEN 0 ELSE 1 END, request.created_at DESC LIMIT 100`)
      .bind(member.id).all<{
        id: string; action: ApiWriteAction; problemId: string | null; playgroundPostId: string | null; payload: string; status: string; resultId: string | null;
        error: string | null; createdAt: string; reviewedAt: string | null; keyName: string; shortCode: string | null;
        problemTitle: string | null; currentBody: string | null; currentBackground: string | null; currentStatus: string | null;
        problemCreatorId: string | null; currentTags: string; playgroundTitle: string | null; currentPlaygroundBody: string | null;
        currentPlaygroundUpdatedAt: string | null; currentPlaygroundTags: string; currentPlaygroundResources: string;
      }>(),
    db.prepare(`SELECT log.id,log.api_key_id AS apiKeyId,key.name AS keyName,log.method,log.path,
        log.status_code AS statusCode,log.request_id AS requestId,log.created_at AS createdAt
      FROM api_call_logs log JOIN api_keys key ON key.id = log.api_key_id
      WHERE log.member_id = ? ORDER BY log.created_at DESC LIMIT 200`)
      .bind(member.id).all<{ id: string; apiKeyId: string; keyName: string; method: string; path: string; statusCode: number; requestId: string | null; createdAt: string }>(),
    listApiStagedUploads(member.id),
  ]);
  return {
    preference,
    globalControl,
    keys,
    requests: requests.results.map((request) => {
      const payload = JSON.parse(request.payload) as Record<string, unknown>;
      const currentTags = request.currentTags ? request.currentTags.split("|") : [];
      const currentPlaygroundTags = request.currentPlaygroundTags ? request.currentPlaygroundTags.split("|") : [];
      const currentPlaygroundResources = JSON.parse(request.currentPlaygroundResources || "[]") as Array<Record<string, unknown>>;
      return {
        ...request,
        payload,
        currentTags,
        currentPlaygroundTags,
        currentPlaygroundResources,
        riskFlags: request.action === "update_own_problem" ? apiUpdateRiskFlags(payload, {
          title: request.problemTitle ?? "",
          body: request.currentBody ?? "",
          background: request.currentBackground ?? "",
          status: request.currentStatus ?? "开放",
          tags: currentTags,
        }) : request.action === "update_own_playground_post" ? apiPlaygroundUpdateRiskFlags(payload, {
          body: request.currentPlaygroundBody ?? "",
          tags: currentPlaygroundTags,
          resources: currentPlaygroundResources.map((resource) => ({ id: typeof resource.id === "string" ? resource.id : "" })),
        }) : [],
      };
    }),
    logs: logs.results,
    stagedUploads,
  };
}

export async function readProblemForApi(problemId: string) {
  await ensureDatabase();
  const db = database();
  const problem = await db.prepare(`SELECT problem.id,problem.short_code AS shortCode,problem.title,problem.body,problem.background,
      problem.status,problem.creator_id AS creatorId,creator.display_name AS creatorName,problem.created_at AS createdAt,
      problem.updated_at AS updatedAt,COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM problem_tags WHERE problem_id = problem.id), '') AS tags
    FROM problems problem JOIN members creator ON creator.id = problem.creator_id
    WHERE problem.id = ? AND problem.is_hidden = 0`).bind(problemId).first<{
      id: string; shortCode: string; title: string; body: string; background: string; status: string; creatorId: string;
      creatorName: string; createdAt: string; updatedAt: string; tags: string;
    }>();
  if (!problem) throw new AuthError("难题不存在", 404);
  const messages = await db.prepare(`WITH RECURSIVE visible_messages AS (
      SELECT id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at
      FROM messages WHERE problem_id = ? AND parent_id IS NULL AND is_hidden = 0
      UNION ALL
      SELECT child.id,child.problem_id,child.parent_id,child.author_id,child.body,child.kind,child.is_adopted,child.upvotes,child.created_at,child.updated_at
      FROM messages child JOIN visible_messages parent ON child.parent_id = parent.id
      WHERE child.problem_id = ? AND child.is_hidden = 0
    ) SELECT message.*,author.display_name AS authorName,author.username AS authorUsername
    FROM visible_messages message JOIN members author ON author.id = message.author_id ORDER BY message.created_at ASC`)
    .bind(problemId, problemId).all<Record<string, unknown>>();
  return { ...problem, tags: problem.tags ? problem.tags.split("|") : [], messages: messages.results };
}

export async function reviewApiRequest(member: SessionMember, requestId: string, decision: "approve" | "reject", confirmRisk = false) {
  await ensureDatabase();
  const db = database();
  await db.prepare("UPDATE api_requests SET status = 'pending', reviewed_at = NULL WHERE status LIKE 'processing-%' AND reviewed_at < ?")
    .bind(new Date(Date.now() - 10 * 60_000).toISOString()).run();
  const request = await db.prepare(`SELECT request.id,request.action,request.problem_id AS problemId,request.playground_post_id AS playgroundPostId,request.payload,request.status,
      problem.title AS problemTitle,problem.body AS currentBody,problem.background AS currentBackground,
      problem.status AS currentStatus,problem.updated_at AS currentUpdatedAt,
      COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM problem_tags WHERE problem_id = problem.id), '') AS currentTags,
      playground.body AS currentPlaygroundBody,
      COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM playground_tags WHERE post_id = playground.id), '') AS currentPlaygroundTags,
      COALESCE((SELECT json_group_array(json_object('id',resource.id)) FROM playground_resources resource WHERE resource.post_id = playground.id), '[]') AS currentPlaygroundResources
    FROM api_requests request LEFT JOIN problems problem ON problem.id = request.problem_id
    LEFT JOIN playground_posts playground ON playground.id = request.playground_post_id
    WHERE request.id = ? AND request.member_id = ?`).bind(requestId, member.id).first<{
      id: string; action: ApiWriteAction; problemId: string | null; playgroundPostId: string | null; payload: string; status: string;
      problemTitle: string | null; currentBody: string | null; currentBackground: string | null;
      currentStatus: string | null; currentUpdatedAt: string | null; currentTags: string; currentPlaygroundBody: string | null;
      currentPlaygroundTags: string; currentPlaygroundResources: string;
    }>();
  if (!request) throw new AuthError("待处理请求不存在", 404);
  if (request.status !== "pending") throw new AuthError("这个请求已经处理", 409);
  const payload = JSON.parse(request.payload) as Record<string, unknown>;
  if (decision === "approve" && request.action === "update_own_problem") {
    const riskFlags = apiUpdateRiskFlags(payload, {
      title: request.problemTitle ?? "",
      body: request.currentBody ?? "",
      background: request.currentBackground ?? "",
      status: request.currentStatus ?? "开放",
      tags: request.currentTags ? request.currentTags.split("|") : [],
    });
    if (riskFlags.length && !confirmRisk) throw new AuthError(`这项修改需要二次确认：${riskFlags.join("、")}`, 409);
  }
  if (decision === "approve" && request.action === "update_own_playground_post") {
    const resources = JSON.parse(request.currentPlaygroundResources || "[]") as Array<{ id: string }>;
    const riskFlags = apiPlaygroundUpdateRiskFlags(payload, {
      body: request.currentPlaygroundBody ?? "",
      tags: request.currentPlaygroundTags ? request.currentPlaygroundTags.split("|") : [],
      resources,
    });
    if (riskFlags.length && !confirmRisk) throw new AuthError(`这项修改需要二次确认：${riskFlags.join("、")}`, 409);
  }
  const reviewedAt = new Date().toISOString();
  const reviewToken = `processing-${crypto.randomUUID()}`;
  await db.prepare("UPDATE api_requests SET status = ?, reviewed_at = ? WHERE id = ? AND member_id = ? AND status = 'pending'")
    .bind(reviewToken, reviewedAt, requestId, member.id).run();
  const claimed = await db.prepare("SELECT status FROM api_requests WHERE id = ? AND member_id = ?")
    .bind(requestId, member.id).first<{ status: string }>();
  if (claimed?.status !== reviewToken) throw new AuthError("这个请求正在处理或已经处理", 409);
  if (decision === "reject") {
    await db.prepare("UPDATE api_requests SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = ?")
      .bind(reviewedAt, requestId, reviewToken).run();
    if (request.action === "create_playground_post" || request.action === "update_own_playground_post") await disposeApiRequestUploads(requestId);
    return { status: "rejected" as const };
  }

  let resultId: string | null = null;
  try {
    if (request.action === "create_problem") {
      const { createProblem } = await import("./queries");
      resultId = (await createProblem(member, { title: payload.title, body: payload.body, background: payload.background, tags: payload.tags })).id;
    } else if (request.action === "update_own_problem") {
      if (!request.problemId) throw new AuthError("目标难题不存在", 404);
      const owner = await db.prepare("SELECT creator_id AS creatorId,background,updated_at AS updatedAt FROM problems WHERE id = ?").bind(request.problemId).first<{ creatorId: string; background: string; updatedAt: string }>();
      if (!owner || owner.creatorId !== member.id) throw new AuthError("只能修改自己创建的难题", 403);
      if (typeof payload.baseUpdatedAt !== "string" || payload.baseUpdatedAt !== owner.updatedAt) throw new AuthError("难题已在提交后更新，请重新读取并提交修改", 409);
      const { applyProblemAction } = await import("./queries");
      await applyProblemAction(request.problemId, member, {
        action: "update_problem",
        title: payload.title,
        body: payload.body,
        background: Object.hasOwn(payload, "background") ? payload.background : owner.background,
        tags: payload.tags,
        status: payload.status,
      });
      resultId = request.problemId;
    } else if (request.action === "create_direct_message") {
      if (!request.problemId) throw new AuthError("目标难题不存在", 404);
      const { applyProblemAction } = await import("./queries");
      await applyProblemAction(request.problemId, member, { action: "create_message", body: payload.body, attachments: [] });
      resultId = request.problemId;
    } else {
      resultId = await applyPlaygroundApiRequest({
        requestId,
        action: request.action,
        playgroundPostId: request.playgroundPostId,
        payload,
        member,
      });
    }
    await db.prepare("UPDATE api_requests SET status = 'approved', result_id = ?, error = NULL, reviewed_at = ? WHERE id = ? AND status = ?")
      .bind(resultId, reviewedAt, requestId, reviewToken).run();
    return { status: "approved" as const, resultId };
  } catch (error) {
    if (request.action === "create_playground_post" || request.action === "update_own_playground_post") await disposeApiRequestUploads(requestId);
    const message = error instanceof Error ? error.message : "执行失败";
    await db.prepare("UPDATE api_requests SET status = 'failed', error = ?, reviewed_at = ? WHERE id = ? AND status = ?")
      .bind(message.slice(0, 500), reviewedAt, requestId, reviewToken).run();
    throw error;
  }
}
