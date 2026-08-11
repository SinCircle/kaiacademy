import { createProblem, searchProblems } from "../../../db/problems";

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().replace(/\s+/g, " "))
      .filter((tag) => tag.length > 0 && tag.length <= 24),
  )].slice(0, 8);
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
    return Response.json({ problems: await searchProblems(query) });
  } catch (error) {
    console.error("Failed to search problems", error);
    return Response.json({ message: "暂时无法读取已发布的问题" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const background = typeof payload.background === "string" ? payload.background.trim() : "";
    const tags = cleanTags(payload.tags);

    if (!title || !body || tags.length === 0) {
      return Response.json({ message: "请填写标题、问题正文，并至少添加一个标签" }, { status: 400 });
    }

    const problem = await createProblem({ title, body, background, tags });
    return Response.json({ problem }, { status: 201 });
  } catch (error) {
    console.error("Failed to publish problem", error);
    return Response.json({ message: "发布失败，请稍后重试" }, { status: 500 });
  }
}
