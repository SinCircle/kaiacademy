import { requireMember } from "../../../../../db/auth";
import { searchPlaygroundTransferCandidates } from "../../../../../db/playground";
import { apiError, cachedJsonResponse } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const member = await requireMember(request);
    const { id } = await context.params;
    const query = new URL(request.url).searchParams.get("q");
    return cachedJsonResponse(request, { items: await searchPlaygroundTransferCandidates(id, member, query) });
  } catch (error) {
    return apiError(error, "暂时无法搜索成员");
  }
}
