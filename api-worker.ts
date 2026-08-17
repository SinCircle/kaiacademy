import { GET as listProblems, POST as createProblem } from "./app/api/v1/problems/route";
import { GET as readProblem, PATCH as updateProblem } from "./app/api/v1/problems/[id]/route";
import { POST as createDiscussion } from "./app/api/v1/problems/[id]/discussions/route";
import { GET as listPlayground, POST as createPlayground } from "./app/api/v1/playground/route";
import { GET as readPlayground, PATCH as updatePlayground } from "./app/api/v1/playground/[id]/route";
import { POST as uploadPlaygroundResource } from "./app/api/v1/playground/uploads/route";
import { GET as downloadPlaygroundResource } from "./app/api/v1/playground/resources/[id]/route";
import { GET as readKeyPermissions } from "./app/api/v1/key/permissions/route";
import { GET as listPendingRequests } from "./app/api/v1/requests/route";
import { DELETE as withdrawPendingRequest } from "./app/api/v1/requests/[id]/route";
import {
  DELETE as rejectDelete,
  GET as rejectGet,
  PATCH as rejectPatch,
  POST as rejectPost,
  PUT as rejectPut,
} from "./app/api/v1/[...path]/route";

const maximumBodyBytes = 128 * 1024;
const maximumUploadBytes = 10 * 1024 * 1024;
const maximumPathBytes = 2048;
const rateWindowMs = 60_000;
const rateLimit = 120;
const maximumConcurrentRequests = 8;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let activeRequests = 0;
const activeUploads = new Map<string, number>();

function jsonError(message: string, status: number) {
  return Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

function rawPath(request: Request) {
  const absolute = request.url;
  const scheme = absolute.indexOf("://");
  const firstSlash = scheme < 0 ? absolute.indexOf("/") : absolute.indexOf("/", scheme + 3);
  const target = firstSlash < 0 ? "/" : absolute.slice(firstSlash);
  return target.split("?", 1)[0];
}

function invalidPath(request: Request) {
  const path = rawPath(request);
  if (new TextEncoder().encode(path).byteLength > maximumPathBytes) return true;
  if (path.includes("\\") || /%(?:00|2e|2f|5c)/i.test(path)) return true;
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

async function rateKey(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${address}\u0000${authorization}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRate(request: Request) {
  const now = Date.now();
  const key = await rateKey(request);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + rateWindowMs });
    return true;
  }
  current.count += 1;
  return current.count <= rateLimit;
}

function routeRequest(request: Request) {
  const pathname = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();
  if (pathname === "/api/v1/problems") {
    if (method === "GET") return listProblems(request);
    if (method === "POST") return createProblem(request);
    return jsonError("请求方法不受支持", 405);
  }

  if (pathname === "/api/v1/playground") {
    if (method === "GET") return listPlayground(request);
    if (method === "POST") return createPlayground(request);
    return jsonError("请求方法不受支持", 405);
  }

  if (pathname === "/api/v1/playground/uploads") {
    if (method === "POST") return uploadPlaygroundResource(request);
    return jsonError("请求方法不受支持", 405);
  }

  if (pathname === "/api/v1/key/permissions") {
    if (method === "GET") return readKeyPermissions(request);
    return jsonError("请求方法不受支持", 405);
  }

  if (pathname === "/api/v1/requests") {
    if (method === "GET") return listPendingRequests(request);
    return jsonError("请求方法不受支持", 405);
  }

  const pendingRequest = pathname.match(/^\/api\/v1\/requests\/([^/]+)$/);
  if (pendingRequest) {
    if (method !== "DELETE") return jsonError("请求方法不受支持", 405);
    return withdrawPendingRequest(request, { params: Promise.resolve({ id: pendingRequest[1] }) });
  }

  const playgroundResource = pathname.match(/^\/api\/v1\/playground\/resources\/([^/]+)$/);
  if (playgroundResource) {
    if (method !== "GET") return jsonError("请求方法不受支持", 405);
    return downloadPlaygroundResource(request, { params: Promise.resolve({ id: playgroundResource[1] }) });
  }

  const playgroundDetail = pathname.match(/^\/api\/v1\/playground\/([^/]+)$/);
  if (playgroundDetail) {
    const context = { params: Promise.resolve({ id: playgroundDetail[1] }) };
    if (method === "GET") return readPlayground(request, context);
    if (method === "PATCH") return updatePlayground(request, context);
    return jsonError("请求方法不受支持", 405);
  }

  const discussion = pathname.match(/^\/api\/v1\/problems\/([^/]+)\/discussions$/);
  if (discussion) {
    if (method !== "POST") return jsonError("请求方法不受支持", 405);
    return createDiscussion(request, { params: Promise.resolve({ id: discussion[1] }) });
  }

  const detail = pathname.match(/^\/api\/v1\/problems\/([^/]+)$/);
  if (detail) {
    const context = { params: Promise.resolve({ id: detail[1] }) };
    if (method === "GET") return readProblem(request, context);
    if (method === "PATCH") return updateProblem(request, context);
    return jsonError("请求方法不受支持", 405);
  }

  if (method === "GET") return rejectGet(request);
  if (method === "POST") return rejectPost(request);
  if (method === "PATCH") return rejectPatch(request);
  if (method === "PUT") return rejectPut(request);
  if (method === "DELETE") return rejectDelete(request);
  return jsonError("请求方法不受支持", 405);
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response(null, { status: 204 });
    if (url.pathname !== "/api/v1" && !url.pathname.startsWith("/api/v1/")) return jsonError("接口不存在", 404);
    if (invalidPath(request)) return jsonError("请求路径无效", 400);

    const uploadRequest = url.pathname === "/api/v1/playground/uploads" && request.method.toUpperCase() === "POST";
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > (uploadRequest ? maximumUploadBytes : maximumBodyBytes)) return jsonError("请求内容过大", 413);
    if (!(await checkRate(request))) return jsonError("请求过于频繁，请稍后重试", 429);
    if (activeRequests >= maximumConcurrentRequests) return jsonError("API 正忙，请稍后重试", 503);

    const uploadKey = uploadRequest ? await rateKey(request) : null;
    if (uploadKey && (activeUploads.get(uploadKey) ?? 0) >= 2) return jsonError("同一 API Key 最多同时上传 2 个文件", 429);

    activeRequests += 1;
    if (uploadKey) activeUploads.set(uploadKey, (activeUploads.get(uploadKey) ?? 0) + 1);
    try {
      return await routeRequest(request);
    } catch (error) {
      console.error("Uncaught API worker error", error);
      return jsonError("API 服务暂时不可用", 500);
    } finally {
      activeRequests -= 1;
      if (uploadKey) {
        const remaining = (activeUploads.get(uploadKey) ?? 1) - 1;
        if (remaining > 0) activeUploads.set(uploadKey, remaining);
        else activeUploads.delete(uploadKey);
      }
    }
  },
};
