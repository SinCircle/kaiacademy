import { requireMember } from "../../../db/auth";
import { generateInvitation } from "../../../db/queries";
import { apiError, assertSameOrigin } from "../_shared";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json(await generateInvitation(await requireMember(request)), { status: 201 });
  } catch (error) {
    return apiError(error, "生成邀请码失败");
  }
}
