import { listTags } from "../../../db/queries";
import { apiError } from "../_shared";

export async function GET() {
  try {
    return Response.json({ tags: await listTags() });
  } catch (error) {
    return apiError(error, "暂时无法读取标签");
  }
}
