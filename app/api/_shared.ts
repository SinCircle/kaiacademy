import { AppError } from "../../db/errors";

export function apiError(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof AppError) return Response.json({ message: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ message: fallback }, { status: 500 });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  if (origin !== `${protocol}://${host}`) throw new AppError("请求来源无效", 403);
}
