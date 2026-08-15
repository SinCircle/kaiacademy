import {
  MAX_PLAYGROUND_RESOURCE_DESCRIPTION,
  MAX_PLAYGROUND_RESOURCES,
  MAX_PLAYGROUND_UPLOAD_BYTES,
  resourceExtension,
  validatePlaygroundUpload,
} from "../app/lib/playground";
import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { mediaBucket } from "./media";
import {
  deletePlaygroundObjects,
  downloadPlaygroundResource,
  externalPlaygroundResourceRecords,
  getPlaygroundDetail,
  listPlaygroundPosts,
  normalizePlaygroundPostPayload,
  playgroundFileDisplayName,
  playgroundResourceInsert,
  validatePlaygroundResourceSet,
  type StoredResource,
} from "./playground";
import { database, ensureDatabase } from "./runtime";

export const API_UPLOAD_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_API_STAGED_BYTES = 50 * 1024 * 1024;

export type PlaygroundApiAction = "create_playground_post" | "update_own_playground_post";

type StagedUploadRow = {
  id: string;
  apiKeyId: string;
  memberId: string;
  requestId: string | null;
  displayName: string;
  description: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  expiresAt: string;
};

function decodeHeader(value: string | null, maximum: number) {
  if (!value) return "";
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Keep the literal header when it is not URL encoded. */ }
  return decoded.replace(/\r\n?/g, "\n").trim().slice(0, maximum);
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function uploadIds(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.uploadIds)) throw new AuthError("uploadIds 必须是数组", 400);
  const ids = [...new Set(payload.uploadIds.map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean))];
  if (ids.length > MAX_PLAYGROUND_RESOURCES) throw new AuthError(`每篇内容最多添加 ${MAX_PLAYGROUND_RESOURCES} 个资源`, 400);
  return ids;
}

function storedUploadRecords(postId: string, rows: StagedUploadRow[], createdAt: string): StoredResource[] {
  return rows.map((row) => ({
    id: `playground-resource-${crypto.randomUUID()}`,
    postId,
    kind: "upload",
    displayName: row.displayName,
    description: row.description,
    storageKey: row.storageKey,
    externalUrl: null,
    mimeType: row.mimeType,
    byteSize: Number(row.byteSize),
    sha256: row.sha256,
    downloadCount: 0,
    createdAt,
  }));
}

async function rowsForIds(ids: string[], keyId: string, memberId: string) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await database().prepare(`SELECT id,api_key_id AS apiKeyId,member_id AS memberId,request_id AS requestId,
      display_name AS displayName,description,storage_key AS storageKey,mime_type AS mimeType,byte_size AS byteSize,
      sha256,created_at AS createdAt,expires_at AS expiresAt
    FROM api_staged_uploads WHERE id IN (${placeholders}) AND api_key_id = ? AND member_id = ? AND expires_at > ?`)
    .bind(...ids, keyId, memberId, new Date().toISOString()).all<StagedUploadRow>();
  if (rows.results.length !== ids.length) throw new AuthError("隔离文件不存在、已过期或不属于当前 API Key", 400);
  return ids.map((id) => rows.results.find((row) => row.id === id)!);
}

async function rowsForRequest(requestId: string) {
  const rows = await database().prepare(`SELECT id,api_key_id AS apiKeyId,member_id AS memberId,request_id AS requestId,
      display_name AS displayName,description,storage_key AS storageKey,mime_type AS mimeType,byte_size AS byteSize,
      sha256,created_at AS createdAt,expires_at AS expiresAt
    FROM api_staged_uploads WHERE request_id = ? ORDER BY created_at,id`)
    .bind(requestId).all<StagedUploadRow>();
  return rows.results;
}

export async function cleanupExpiredApiUploads() {
  await ensureDatabase();
  const expired = await database().prepare("SELECT id,storage_key AS storageKey FROM api_staged_uploads WHERE expires_at <= ? LIMIT 200")
    .bind(new Date().toISOString()).all<{ id: string; storageKey: string }>();
  if (!expired.results.length) return;
  await deletePlaygroundObjects(expired.results.map((row) => row.storageKey));
  await database().batch(expired.results.map((row) => database().prepare("DELETE FROM api_staged_uploads WHERE id = ?").bind(row.id)));
}

export async function stageApiPlaygroundUpload(request: Request, keyId: string, member: SessionMember) {
  await cleanupExpiredApiUploads();
  if (!request.body) throw new AuthError("文件内容为空", 400);
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (!Number.isInteger(contentLength) || contentLength <= 0) throw new AuthError("必须提供有效的 Content-Length", 411);
  const displayName = playgroundFileDisplayName(decodeHeader(request.headers.get("x-file-name"), 240));
  const description = decodeHeader(request.headers.get("x-file-description"), MAX_PLAYGROUND_RESOURCE_DESCRIPTION);
  const mimeType = (request.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0].trim().toLowerCase() || "application/octet-stream";
  const expectedSha256 = (request.headers.get("x-content-sha256") ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new AuthError("必须提供有效的 X-Content-SHA256", 400);
  const uploadProblem = validatePlaygroundUpload({ name: displayName, size: contentLength, type: mimeType });
  if (uploadProblem) throw new AuthError(uploadProblem, 400);

  const usage = await database().prepare("SELECT COALESCE(SUM(byte_size),0) AS bytes FROM api_staged_uploads WHERE member_id = ? AND expires_at > ?")
    .bind(member.id, new Date().toISOString()).first<{ bytes: number }>();
  if (Number(usage?.bytes ?? 0) + contentLength > MAX_API_STAGED_BYTES) throw new AuthError("文件隔离区最多保留 50 MB，请先处理或作废已有文件", 413);

  const id = `api-upload-${crypto.randomUUID()}`;
  const extension = resourceExtension(displayName);
  const storageKey = `api-staging/${member.id}/${id}.${extension}`;
  const [storageStream, hashStream] = request.body.tee();
  let actualBytes = 0;
  const countedStream = storageStream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      actualBytes += chunk.byteLength;
      if (actualBytes > MAX_PLAYGROUND_UPLOAD_BYTES) throw new Error("UPLOAD_TOO_LARGE");
      controller.enqueue(chunk);
    },
  }));
  const digestStreamConstructor = (crypto as typeof crypto & {
    DigestStream?: new (algorithm: string) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };
  }).DigestStream;
  const digestPromise = digestStreamConstructor
    ? (() => { const stream = new digestStreamConstructor("SHA-256"); return hashStream.pipeTo(stream).then(() => stream.digest); })()
    : new Response(hashStream).arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes));
  const fixedLengthStreamConstructor = (globalThis as typeof globalThis & {
    FixedLengthStream: new (expectedLength: number) => {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }).FixedLengthStream;
  const fixedLengthStream = new fixedLengthStreamConstructor(contentLength);
  const storagePipePromise = countedStream.pipeTo(fixedLengthStream.writable);
  const storagePromise = mediaBucket().put(storageKey, fixedLengthStream.readable, {
    httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
    customMetadata: { memberId: member.id, apiKeyId: keyId, stagedUploadId: id },
  });
  try {
    const [, , digest] = await Promise.all([storagePipePromise, storagePromise, digestPromise]);
    const actualSha256 = hex(digest);
    if (actualBytes !== contentLength) throw new AuthError("文件长度与 Content-Length 不一致", 400);
    if (actualSha256 !== expectedSha256) throw new AuthError("文件校验失败，SHA-256 不一致", 400);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + API_UPLOAD_TTL_MS).toISOString();
    const inserted = await database().prepare(`INSERT INTO api_staged_uploads
      (id,api_key_id,member_id,request_id,display_name,description,storage_key,mime_type,byte_size,sha256,created_at,expires_at)
      SELECT ?,?,?,NULL,?,?,?,?,?,?,?,?
      WHERE (SELECT COALESCE(SUM(byte_size),0) FROM api_staged_uploads WHERE member_id = ? AND expires_at > ?) + ? <= ?`)
      .bind(id, keyId, member.id, displayName, description, storageKey, mimeType, actualBytes, actualSha256, createdAt, expiresAt,
        member.id, createdAt, actualBytes, MAX_API_STAGED_BYTES).run() as { meta?: { changes?: number } };
    if (!inserted.meta?.changes) throw new AuthError("文件隔离区最多保留 50 MB，请先处理或作废已有文件", 413);
    return { uploadId: id, displayName, byteSize: actualBytes, sha256: actualSha256, expiresAt };
  } catch (error) {
    await Promise.allSettled([storagePipePromise, storagePromise, digestPromise]);
    await deletePlaygroundObjects([storageKey]);
    if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") throw new AuthError("单个文件不能超过 10 MB", 413);
    throw error;
  }
}

export async function listApiStagedUploads(memberId: string) {
  await cleanupExpiredApiUploads();
  const rows = await database().prepare(`SELECT upload.id,upload.api_key_id AS apiKeyId,key.name AS keyName,upload.request_id AS requestId,
      request.action AS requestAction,upload.display_name AS displayName,upload.description,upload.mime_type AS mimeType,
      upload.byte_size AS byteSize,upload.sha256,upload.created_at AS createdAt,upload.expires_at AS expiresAt
    FROM api_staged_uploads upload JOIN api_keys key ON key.id = upload.api_key_id
    LEFT JOIN api_requests request ON request.id = upload.request_id
    WHERE upload.member_id = ? AND upload.expires_at > ? ORDER BY upload.created_at DESC`)
    .bind(memberId, new Date().toISOString()).all<Record<string, unknown>>();
  return rows.results;
}

export async function downloadApiStagedUpload(uploadId: string, member: SessionMember) {
  await cleanupExpiredApiUploads();
  const row = await database().prepare(`SELECT display_name AS displayName,storage_key AS storageKey,mime_type AS mimeType,byte_size AS byteSize
    FROM api_staged_uploads WHERE id = ? AND member_id = ? AND expires_at > ?`)
    .bind(uploadId, member.id, new Date().toISOString()).first<{ displayName: string; storageKey: string; mimeType: string; byteSize: number }>();
  if (!row) throw new AuthError("隔离文件不存在或已过期", 404);
  const object = await mediaBucket().get(row.storageKey);
  if (!object) throw new AuthError("隔离文件不存在", 404);
  const filename = encodeURIComponent(row.displayName).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(object.body, { headers: {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${filename}`,
    "Content-Length": String(object.size),
    "Content-Type": row.mimeType,
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function discardApiStagedUpload(uploadId: string, member: SessionMember) {
  await cleanupExpiredApiUploads();
  const row = await database().prepare("SELECT request_id AS requestId,storage_key AS storageKey FROM api_staged_uploads WHERE id = ? AND member_id = ?")
    .bind(uploadId, member.id).first<{ requestId: string | null; storageKey: string }>();
  if (!row) throw new AuthError("隔离文件不存在或已过期", 404);
  if (row.requestId) {
    const reviewedAt = new Date().toISOString();
    const reviewToken = `processing-discard-${crypto.randomUUID()}`;
    const db = database();
    await db.prepare("UPDATE api_requests SET status = ?, reviewed_at = ? WHERE id = ? AND member_id = ? AND status = 'pending'")
      .bind(reviewToken, reviewedAt, row.requestId, member.id).run();
    const claimed = await db.prepare("SELECT status FROM api_requests WHERE id = ? AND member_id = ?")
      .bind(row.requestId, member.id).first<{ status: string }>();
    if (claimed?.status !== reviewToken) throw new AuthError("所属请求正在处理或已经处理", 409);
    try {
      await disposeApiRequestUploads(row.requestId);
      await db.prepare("UPDATE api_requests SET status = 'rejected', reviewed_at = ? WHERE id = ? AND status = ?")
        .bind(reviewedAt, row.requestId, reviewToken).run();
      return { discarded: true, requestRejected: true };
    } catch (error) {
      await db.prepare("UPDATE api_requests SET status = 'pending', reviewed_at = NULL WHERE id = ? AND status = ?")
        .bind(row.requestId, reviewToken).run();
      throw error;
    }
  }
  await deletePlaygroundObjects([row.storageKey]);
  await database().prepare("DELETE FROM api_staged_uploads WHERE id = ? AND member_id = ?").bind(uploadId, member.id).run();
  return { discarded: true, requestRejected: false };
}

export async function disposeApiRequestUploads(requestId: string) {
  const rows = await rowsForRequest(requestId);
  await deletePlaygroundObjects(rows.map((row) => row.storageKey));
  await database().prepare("DELETE FROM api_staged_uploads WHERE request_id = ?").bind(requestId).run();
}

export async function submitPlaygroundApiRequest(
  keyId: string,
  member: SessionMember,
  action: PlaygroundApiAction,
  playgroundPostId: string | null,
  payload: Record<string, unknown>,
) {
  await cleanupExpiredApiUploads();
  const ids = uploadIds(payload);
  const normalized = normalizePlaygroundPostPayload(payload);
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > 128 * 1024) throw new AuthError("请求内容过大", 413);
  const db = database();
  const duplicate = await db.prepare(`SELECT id FROM api_requests
    WHERE member_id = ? AND action = ? AND COALESCE(playground_post_id,'') = COALESCE(?,'') AND payload = ? AND status = 'pending'
    ORDER BY created_at DESC LIMIT 1`).bind(member.id, action, playgroundPostId, serialized).first<{ id: string }>();
  if (duplicate) return { id: duplicate.id, status: "pending" as const };
  if (action === "update_own_playground_post" && playgroundPostId) {
    const pending = await db.prepare("SELECT id FROM api_requests WHERE member_id = ? AND action = 'update_own_playground_post' AND playground_post_id = ? AND status = 'pending' LIMIT 1")
      .bind(member.id, playgroundPostId).first<{ id: string }>();
    if (pending) throw new AuthError("这篇内容已有一条待处理修改，请先处理后再提交", 409);
  }
  const rows = await rowsForIds(ids, keyId, member.id);
  if (rows.some((row) => row.requestId)) throw new AuthError("有隔离文件已经随其他请求提交", 409);
  const stagedFiles = rows.map((row) => ({ name: row.displayName, size: Number(row.byteSize), type: row.mimeType, description: row.description }));
  if (action === "create_playground_post") {
    validatePlaygroundResourceSet(stagedFiles, normalized.externalResources.length);
  } else {
    if (!playgroundPostId) throw new AuthError("目标内容不存在", 404);
    if (!Array.isArray(payload.keepResourceIds)) throw new AuthError("keepResourceIds 必须是数组", 400);
    const keepIds = [...new Set(payload.keepResourceIds.map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean))];
    const current = await db.prepare("SELECT id,kind,byte_size AS byteSize FROM playground_resources WHERE post_id = ?")
      .bind(playgroundPostId).all<{ id: string; kind: string; byteSize: number | null }>();
    if (keepIds.some((id) => !current.results.some((resource) => resource.id === id))) throw new AuthError("保留的资源不存在", 400);
    const retained = current.results.filter((resource) => keepIds.includes(resource.id));
    validatePlaygroundResourceSet(stagedFiles, normalized.externalResources.length,
      retained.reduce((sum, resource) => sum + (resource.kind === "upload" ? Number(resource.byteSize ?? 0) : 0), 0), retained.length);
  }
  const pendingCount = await db.prepare("SELECT COUNT(*) AS count FROM api_requests WHERE member_id = ? AND status = 'pending'")
    .bind(member.id).first<{ count: number }>();
  if (Number(pendingCount?.count ?? 0) >= 64) throw new AuthError("账户已有 64 条待处理请求，请先完成审批", 429);
  const id = `api-request-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO api_requests
      (id,api_key_id,member_id,action,problem_id,playground_post_id,payload,status,result_id,error,created_at,reviewed_at)
      VALUES (?,?,?,?,NULL,?,?,'pending',NULL,NULL,?,NULL)`)
      .bind(id, keyId, member.id, action, playgroundPostId, serialized, createdAt),
    ...rows.map((row) => db.prepare("UPDATE api_staged_uploads SET request_id = ? WHERE id = ? AND request_id IS NULL").bind(id, row.id)),
  ]);
  if (rows.length) {
    const attached = await db.prepare("SELECT COUNT(*) AS count FROM api_staged_uploads WHERE request_id = ?").bind(id).first<{ count: number }>();
    if (Number(attached?.count ?? 0) !== rows.length) {
      await db.prepare("UPDATE api_staged_uploads SET request_id = NULL WHERE request_id = ?").bind(id).run();
      await db.prepare("DELETE FROM api_requests WHERE id = ?").bind(id).run();
      throw new AuthError("隔离文件已被其他请求占用", 409);
    }
  }
  return { id, status: "pending" as const };
}

export async function listPlaygroundForApi(member: SessionMember, requestUrl: string) {
  const params = new URL(requestUrl).searchParams;
  return listPlaygroundPosts({
    query: params.get("q") ?? "",
    type: params.get("type") ?? "all",
    tag: params.get("tag") ?? "",
    format: params.get("format") ?? "",
    sort: params.get("sort") ?? "latest",
    viewerId: member.id,
  });
}

export async function readPlaygroundForApi(postId: string, member: SessionMember) {
  const detail = await getPlaygroundDetail(postId, member);
  return { post: detail.post, resources: detail.resources, comments: detail.comments };
}

export async function downloadPlaygroundResourceForApi(resourceId: string, member: SessionMember) {
  return downloadPlaygroundResource(resourceId, member);
}

export async function applyPlaygroundApiRequest(input: {
  requestId: string;
  action: PlaygroundApiAction;
  playgroundPostId: string | null;
  payload: Record<string, unknown>;
  member: SessionMember;
}) {
  const staged = await rowsForRequest(input.requestId);
  const normalized = normalizePlaygroundPostPayload(input.payload);
  const stagedFiles = staged.map((row) => ({ name: row.displayName, size: Number(row.byteSize), type: row.mimeType, description: row.description }));
  const db = database();
  const changedAt = new Date().toISOString();

  if (input.action === "create_playground_post") {
    validatePlaygroundResourceSet(stagedFiles, normalized.externalResources.length);
    const postId = `playground-${crypto.randomUUID()}`;
    const resources = [
      ...storedUploadRecords(postId, staged, changedAt),
      ...externalPlaygroundResourceRecords(postId, normalized.externalResources, changedAt),
    ];
    await db.batch([
      db.prepare(`INSERT INTO playground_posts
        (id,title,body,author_id,is_hidden,is_pinned,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?)`)
        .bind(postId, normalized.title, normalized.body, input.member.id, changedAt, changedAt),
      ...normalized.tags.map((tag) => db.prepare("INSERT INTO playground_tags (post_id,tag) VALUES (?,?)").bind(postId, tag)),
      ...resources.map(playgroundResourceInsert),
      db.prepare("DELETE FROM api_staged_uploads WHERE request_id = ?").bind(input.requestId),
    ]);
    return postId;
  }

  if (!input.playgroundPostId) throw new AuthError("目标内容不存在", 404);
  const existing = await db.prepare("SELECT author_id AS authorId,updated_at AS updatedAt FROM playground_posts WHERE id = ? AND is_hidden = 0")
    .bind(input.playgroundPostId).first<{ authorId: string; updatedAt: string }>();
  if (!existing || existing.authorId !== input.member.id) throw new AuthError("只能修改自己创建的游乐场内容", 403);
  if (typeof input.payload.baseUpdatedAt !== "string" || input.payload.baseUpdatedAt !== existing.updatedAt) throw new AuthError("内容已在提交后更新，请重新读取并提交修改", 409);
  if (!Array.isArray(input.payload.keepResourceIds)) throw new AuthError("keepResourceIds 必须是数组", 400);
  const keepIds = [...new Set(input.payload.keepResourceIds.map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean))];
  const current = await db.prepare(`SELECT id,kind,storage_key AS storageKey,byte_size AS byteSize FROM playground_resources WHERE post_id = ?`)
    .bind(input.playgroundPostId).all<{ id: string; kind: string; storageKey: string | null; byteSize: number | null }>();
  if (keepIds.some((id) => !current.results.some((resource) => resource.id === id))) throw new AuthError("保留的资源不存在", 400);
  const retained = current.results.filter((resource) => keepIds.includes(resource.id));
  validatePlaygroundResourceSet(stagedFiles, normalized.externalResources.length,
    retained.reduce((sum, resource) => sum + (resource.kind === "upload" ? Number(resource.byteSize ?? 0) : 0), 0), retained.length);
  const added = [
    ...storedUploadRecords(input.playgroundPostId, staged, changedAt),
    ...externalPlaygroundResourceRecords(input.playgroundPostId, normalized.externalResources, changedAt),
  ];
  const removed = current.results.filter((resource) => !keepIds.includes(resource.id));
  await db.batch([
    db.prepare("UPDATE playground_posts SET title = ?,body = ?,updated_at = ? WHERE id = ?")
      .bind(normalized.title, normalized.body, changedAt, input.playgroundPostId),
    db.prepare("DELETE FROM playground_tags WHERE post_id = ?").bind(input.playgroundPostId),
    ...normalized.tags.map((tag) => db.prepare("INSERT INTO playground_tags (post_id,tag) VALUES (?,?)").bind(input.playgroundPostId!, tag)),
    ...removed.map((resource) => db.prepare("DELETE FROM playground_resources WHERE id = ? AND post_id = ?").bind(resource.id, input.playgroundPostId)),
    ...added.map(playgroundResourceInsert),
    db.prepare("DELETE FROM api_staged_uploads WHERE request_id = ?").bind(input.requestId),
  ]);
  await deletePlaygroundObjects(removed.map((resource) => resource.storageKey).filter((key): key is string => Boolean(key)));
  return input.playgroundPostId;
}
