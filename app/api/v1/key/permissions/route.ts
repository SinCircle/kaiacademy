import { withApiKey } from "../../_shared";

export async function GET(request: Request) {
  return withApiKey(request, "read", async ({ permissions }) => {
    return Response.json({ permissions }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
