import type { AdminPlaygroundPost } from "../app/lib/playground";
import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { asString, database, ensureDatabase } from "./runtime";

async function audit(admin: SessionMember, action: string, targetId: string, detail: Record<string, unknown>) {
  await database().prepare(`INSERT INTO admin_audit_logs
    (id,admin_id,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(`audit-${crypto.randomUUID()}`, admin.id, action, "playground_post", targetId, JSON.stringify(detail), new Date().toISOString()).run();
}

export async function listAdminPlayground(queryValue: unknown): Promise<AdminPlaygroundPost[]> {
  await ensureDatabase();
  const query = asString(queryValue, 120).toLocaleLowerCase();
  const rows = await database().prepare(`SELECT post.id,post.title,post.is_hidden AS isHidden,post.is_pinned AS isPinned,
      post.created_at AS createdAt,post.updated_at AS updatedAt,author.display_name AS authorName,author.email AS authorEmail,
      (SELECT COUNT(*) FROM playground_resources resource WHERE resource.post_id = post.id) AS resourceCount,
      (SELECT COUNT(*) FROM playground_comments comment WHERE comment.post_id = post.id) AS commentCount,
      (SELECT COALESCE(SUM(resource.download_count),0) FROM playground_resources resource WHERE resource.post_id = post.id) AS downloadCount
    FROM playground_posts post JOIN members author ON author.id = post.author_id
    ORDER BY post.updated_at DESC LIMIT 300`).all<{
      id: string; title: string; isHidden: number; isPinned: number; createdAt: string; updatedAt: string;
      authorName: string; authorEmail: string; resourceCount: number; commentCount: number; downloadCount: number;
    }>();
  return rows.results
    .map((row) => ({ ...row, isHidden: Boolean(row.isHidden), isPinned: Boolean(row.isPinned), resourceCount: Number(row.resourceCount), commentCount: Number(row.commentCount), downloadCount: Number(row.downloadCount) }))
    .filter((row) => !query || [row.title, row.authorName, row.authorEmail, row.isHidden ? "已隐藏" : "正常"]
      .some((value) => value.toLocaleLowerCase().includes(query)));
}

export async function updateAdminPlayground(postId: string, admin: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  const existing = await database().prepare("SELECT id,title,is_hidden AS isHidden,is_pinned AS isPinned FROM playground_posts WHERE id = ?")
    .bind(postId).first<{ id: string; title: string; isHidden: number; isPinned: number }>();
  if (!existing) throw new AuthError("内容不存在", 404);
  const isHidden = typeof payload.isHidden === "boolean" ? payload.isHidden : Boolean(existing.isHidden);
  const isPinned = typeof payload.isPinned === "boolean" ? payload.isPinned : Boolean(existing.isPinned);
  const updatedAt = new Date().toISOString();
  await database().prepare("UPDATE playground_posts SET is_hidden = ?, is_pinned = ?, updated_at = ? WHERE id = ?")
    .bind(isHidden ? 1 : 0, isPinned ? 1 : 0, updatedAt, postId).run();
  await audit(admin, "update_playground_moderation", postId, { isHidden, isPinned, title: existing.title });
  return { isHidden, isPinned, updatedAt };
}
