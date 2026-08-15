import { AppError } from "../../db/errors";
export { cachedJsonResponse } from "../lib/http-cache";

const DEPLOYED_ORIGINS = new Set([
  "https://kaiacademy.top",
  // Caddy terminates HTTPS before forwarding to the local Worker runtime.
  "http://kaiacademy.top",
  "http://43.134.66.71",
]);

export function apiError(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof AppError) return Response.json({ message: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ message: fallback }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const normalizedOrigin = origin.trim().replace(/\/$/, "");
  if (DEPLOYED_ORIGINS.has(normalizedOrigin)) return;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  if (normalizedOrigin !== `${protocol}://${host}`) {
    throw new AppError("请求来源无效", 403);
  }
}
