import { listPendingApiRequestsForKey } from "../../../../db/api-access";
import { withApiKey } from "../_shared";

export async function GET(request: Request) {
  return withApiKey(request, "manage_pending_requests", async ({ keyId, member }) => {
    return Response.json({ requests: await listPendingApiRequestsForKey(keyId, member.id) }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
