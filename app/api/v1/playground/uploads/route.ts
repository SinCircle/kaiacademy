import { stageApiPlaygroundUpload } from "../../../../../db/api-playground";
import { withApiKey } from "../../_shared";

export async function POST(request: Request) {
  return withApiKey(request, ["create_playground_post", "update_own_playground_post"], async ({ keyId, member }) => {
    return Response.json(await stageApiPlaygroundUpload(request, keyId, member), { status: 201 });
  });
}
