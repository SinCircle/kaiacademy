import { currentMember, requireMember } from "../../../db/auth";
import { createProblem, listProblems } from "../../../db/queries";
import { apiError, assertSameOrigin } from "../_shared";

function values(params: URLSearchParams, name: string) {
  return params.getAll(name).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const member = await currentMember(request);
    const problems = await listProblems({
      query: params.get("q") ?? "",
      tags: values(params, "tag"),
      statuses: values(params, "status"),
      relations: values(params, "relation"),
      updatedWithin: values(params, "updated"),
      viewerId: member?.id,
      viewerRole: member?.role,
    });
    return Response.json({ problems });
  } catch (error) {
    return apiError(error, "暂时无法读取问题");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const problem = await createProblem(member, await request.json() as Record<string, unknown>);
    return Response.json({ problem }, { status: 201 });
  } catch (error) {
    return apiError(error, "发布失败，请稍后重试");
  }
}
