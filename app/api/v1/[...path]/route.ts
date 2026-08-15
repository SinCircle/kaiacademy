import { ApiScopeViolationError } from "../../../../db/api-access";
import { withApiKey } from "../_shared";

async function rejectUnsupportedApi(request: Request) {
  return withApiKey(request, "read", async () => {
    throw new ApiScopeViolationError("这个接口不在 API 授权范围内", `尝试访问未开放接口：${new URL(request.url).pathname}`);
  });
}

export const GET = rejectUnsupportedApi;
export const POST = rejectUnsupportedApi;
export const PATCH = rejectUnsupportedApi;
export const PUT = rejectUnsupportedApi;
export const DELETE = rejectUnsupportedApi;
