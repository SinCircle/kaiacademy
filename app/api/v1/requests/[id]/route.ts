import { withdrawPendingApiRequest } from "../../../../../db/api-access";
import { withApiKey } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  return withApiKey(request, "manage_pending_requests", async ({ keyId, member }) => {
    const { id } = await context.params;
    return Response.json(await withdrawPendingApiRequest(keyId, member.id, id), { headers: { "Cache-Control": "private, no-store" } });
  });
}
