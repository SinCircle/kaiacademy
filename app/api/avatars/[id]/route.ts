import { AppError } from "../../../../db/errors";
import { mediaBucket } from "../../../../db/media";
import { asString, database, ensureDatabase } from "../../../../db/runtime";
import { apiError } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await ensureDatabase();
    const { id } = await context.params;
    const memberId = asString(id, 100);
    const member = await database().prepare("SELECT avatar_key AS avatarKey FROM members WHERE id = ?")
      .bind(memberId).first<{ avatarKey: string | null }>();
    if (!member?.avatarKey) throw new AppError("头像不存在", 404);
    const object = await mediaBucket().get(member.avatarKey);
    if (!object) throw new AppError("头像不存在", 404);
    return new Response(object.body, {
      headers: {
        "Cache-Control": "public, max-age=60, must-revalidate",
        "Content-Length": String(object.size),
        "Content-Type": "image/webp",
        ETag: object.httpEtag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error, "头像读取失败");
  }
}
