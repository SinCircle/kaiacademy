import { listTags } from "../../../db/queries";
import { apiError, cachedJsonResponse } from "../_shared";

export async function GET(request: Request) {
  try {
    return cachedJsonResponse(request, { tags: await listTags() });
  } catch (error) {
    return apiError(error, "暂时无法读取标签");
  }
}
