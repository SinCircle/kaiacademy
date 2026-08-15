import { downloadPlaygroundResourceForApi } from "../../../../../../db/api-playground";
import { withApiKey } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withApiKey(request, "read", async ({ member }) => {
    const { id } = await context.params;
    return downloadPlaygroundResourceForApi(id, member);
  });
}
