import { requireMember } from "../../../db/auth";
import { generateInvitation, revokeInvitation } from "../../../db/queries";
import { apiError, assertSameOrigin } from "../_shared";
import { publishSyncInvalidation } from "../../../db/sync";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const result = await generateInvitation(member);
    await publishSyncInvalidation([`/api/members/${member.id}`, "/api/members/me", "/api/admin/members"]);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, "生成邀请码失败");
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const code = new URL(request.url).searchParams.get("code");
    const member = await requireMember(request);
    const result = await revokeInvitation(member, code);
    await publishSyncInvalidation([`/api/members/${member.id}`, "/api/members/me", "/api/admin/members"]);
    return Response.json(result);
  } catch (error) {
    return apiError(error, "作废邀请码失败");
  }
}
