import { requireMember } from "../../../db/auth";
import { drawDailyCheckin, getDailyCheckin } from "../../../db/checkin";
import { apiError, assertSameOrigin } from "../_shared";
import { publishSyncInvalidation } from "../../../db/sync";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const requestedMemberId = new URL(request.url).searchParams.get("memberId")?.trim();
    return Response.json(await getDailyCheckin(requestedMemberId || member.id), { headers: privateHeaders });
  } catch (error) {
    return apiError(error, "暂时无法读取签到记录");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const result = await drawDailyCheckin(member.id);
    await publishSyncInvalidation(["/api/checkin"]);
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return apiError(error, "签到失败，请稍后重试");
  }
}
