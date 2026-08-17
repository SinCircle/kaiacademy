import { requireMember } from "../../../../../db/auth";
import { searchProblemTransferCandidates } from "../../../../../db/queries";
import { apiError, assertSameOrigin, cachedJsonResponse } from "../../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const { id } = await context.params;
    const query = new URL(request.url).searchParams.get("q");
    return cachedJsonResponse(request, { items: await searchProblemTransferCandidates(id, member, query) });
  } catch (error) {
    return apiError(error, "暂时无法搜索成员");
  }
}
