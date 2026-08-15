import { requireMember } from "../../../db/auth";
import { AppError } from "../../../db/errors";
import { compressAvatar, imageProcessor, MAX_AVATAR_UPLOAD_BYTES, mediaBucket } from "../../../db/media";
import { database, ensureDatabase } from "../../../db/runtime";
import { apiError, assertSameOrigin } from "../_shared";
import { publishSyncInvalidation } from "../../../db/sync";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const member = await requireMember(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_AVATAR_UPLOAD_BYTES) {
      throw new AppError("头像图片不能超过 10 MB", 413);
    }
    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) throw new AppError("请选择头像图片");
    const file = new File([await request.arrayBuffer()], "avatar", { type: contentType });

    const bytes = await compressAvatar(file);
    const bucket = mediaBucket();
    const db = database();
    const previous = await db.prepare("SELECT avatar_key AS avatarKey FROM members WHERE id = ?")
      .bind(member.id).first<{ avatarKey: string | null }>();
    const key = `avatars/${member.id}/${crypto.randomUUID()}.webp`;
    const updatedAt = new Date().toISOString();

    await bucket.put(key, bytes, {
      httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { memberId: member.id, processed: "server" },
    });
    await db.prepare("UPDATE members SET avatar_key = ?, avatar_updated_at = ? WHERE id = ?")
      .bind(key, updatedAt, member.id).run();
    if (previous?.avatarKey?.startsWith(`avatars/${member.id}/`) && previous.avatarKey !== key) {
      await bucket.delete(previous.avatarKey).catch(() => undefined);
    }
    await publishSyncInvalidation([`/api/members/${member.id}`, "/api/members/me", "/api/session", "/api/problems", "/api/admin/"]);
    return Response.json({
      avatarUrl: `/api/avatars/${encodeURIComponent(member.id)}?v=${encodeURIComponent(updatedAt)}`,
      bytes: bytes.byteLength,
      updatedAt,
    });
  } catch (error) {
    return apiError(error, "头像上传失败，请稍后重试");
  }
}

export async function HEAD() {
  try {
    await ensureDatabase();
    mediaBucket();
    imageProcessor();
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, "头像服务暂不可用");
  }
}
