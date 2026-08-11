import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { mediaBucket } from "./media";
import { asString, database, ensureDatabase } from "./runtime";

const PROBLEM_STATUSES = ["开放", "已解决"];

async function audit(admin: SessionMember, action: string, targetType: string, targetId: string, detail: Record<string, unknown>) {
  await database().prepare(`INSERT INTO admin_audit_logs
    (id,admin_id,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(`audit-${crypto.randomUUID()}`, admin.id, action, targetType, targetId, JSON.stringify(detail), new Date().toISOString()).run();
}

export async function listAdminProblems(queryValue: unknown) {
  await ensureDatabase();
  const query = asString(queryValue, 120).toLocaleLowerCase();
  const rows = await database().prepare(`SELECT
      p.id,p.short_code AS shortCode,p.title,p.status,p.is_hidden AS isHidden,p.is_pinned AS isPinned,
      p.created_at AS createdAt,p.updated_at AS updatedAt,
      creator.display_name AS creatorName,creator.email AS creatorEmail,
      (SELECT COUNT(*) FROM problem_members pm WHERE pm.problem_id = p.id AND pm.relation = 'participating') AS participantCount,
      (SELECT COUNT(*) FROM messages m WHERE m.problem_id = p.id) AS messageCount
    FROM problems p JOIN members creator ON creator.id = p.creator_id
    ORDER BY p.updated_at DESC LIMIT 300`).all<{
      id: string; shortCode: string; title: string; status: string; isHidden: number; isPinned: number;
      createdAt: string; updatedAt: string; creatorName: string; creatorEmail: string;
      participantCount: number; messageCount: number;
    }>();
  return rows.results
    .map((row) => ({ ...row, isHidden: Boolean(row.isHidden), isPinned: Boolean(row.isPinned), participantCount: Number(row.participantCount), messageCount: Number(row.messageCount) }))
    .filter((row) => !query || [row.shortCode, row.title, row.creatorName, row.creatorEmail, row.status]
      .some((value) => value.toLocaleLowerCase().includes(query)));
}

export async function updateAdminProblem(problemId: string, admin: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  const existing = await database().prepare("SELECT id,status,is_hidden AS isHidden,is_pinned AS isPinned FROM problems WHERE id = ?")
    .bind(problemId).first<{ id: string; status: string; isHidden: number; isPinned: number }>();
  if (!existing) throw new AuthError("问题不存在", 404);
  const status = asString(payload.status, 20) || existing.status;
  if (!PROBLEM_STATUSES.includes(status)) throw new AuthError("问题状态无效");
  const isHidden = typeof payload.isHidden === "boolean" ? payload.isHidden : Boolean(existing.isHidden);
  const isPinned = typeof payload.isPinned === "boolean" ? payload.isPinned : Boolean(existing.isPinned);
  const updatedAt = new Date().toISOString();
  await database().prepare("UPDATE problems SET status = ?, is_hidden = ?, is_pinned = ?, updated_at = ? WHERE id = ?")
    .bind(status, isHidden ? 1 : 0, isPinned ? 1 : 0, updatedAt, problemId).run();
  await audit(admin, "update_problem_moderation", "problem", problemId, { status, isHidden, isPinned });
  return { status, isHidden, isPinned, updatedAt };
}

export async function deleteAdminProblem(problemId: string, admin: SessionMember) {
  await ensureDatabase();
  const existing = await database().prepare("SELECT id,title FROM problems WHERE id = ?")
    .bind(problemId).first<{ id: string; title: string }>();
  if (!existing) throw new AuthError("问题不存在", 404);
  await database().prepare("DELETE FROM problems WHERE id = ?").bind(problemId).run();
  await audit(admin, "delete_problem", "problem", problemId, { title: existing.title });
  return { deleted: true };
}

export async function listAdminMembers(queryValue: unknown) {
  await ensureDatabase();
  const query = asString(queryValue, 120).toLocaleLowerCase();
  const rows = await database().prepare(`SELECT
      m.id,m.email,m.username,m.display_name AS displayName,m.initials,m.avatar_updated_at AS avatarUpdatedAt,m.role,
      m.account_status AS accountStatus,m.invite_quota AS inviteQuota,m.created_at AS createdAt,
      (SELECT COUNT(*) FROM problems p WHERE p.creator_id = m.id) AS createdProblemCount,
      (SELECT COUNT(*) FROM problem_members pm WHERE pm.member_id = m.id AND pm.relation = 'participating') AS participatingCount,
      (SELECT COUNT(*) FROM messages message WHERE message.author_id = m.id) AS messageCount
    FROM members m ORDER BY CASE m.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,m.created_at DESC LIMIT 500`).all<{
      id: string; email: string; username: string; displayName: string; initials: string; avatarUpdatedAt: string | null; role: string;
      accountStatus: string; inviteQuota: number; createdAt: string; createdProblemCount: number;
      participatingCount: number; messageCount: number;
    }>();
  return rows.results
    .map((row) => ({
      ...row,
      inviteQuota: Number(row.inviteQuota),
      createdProblemCount: Number(row.createdProblemCount),
      participatingCount: Number(row.participatingCount),
      messageCount: Number(row.messageCount),
    }))
    .filter((row) => !query || [row.email, row.username, row.displayName, row.role, row.accountStatus]
      .some((value) => value.toLocaleLowerCase().includes(query)));
}

export async function updateAdminMember(targetId: string, admin: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  const db = database();
  const existing = await db.prepare(`SELECT id,email,role,account_status AS accountStatus,invite_quota AS inviteQuota
    FROM members WHERE id = ?`).bind(targetId).first<{
      id: string; email: string; role: "member" | "admin" | "superadmin"; accountStatus: "active" | "suspended"; inviteQuota: number;
    }>();
  if (!existing) throw new AuthError("成员不存在", 404);

  const role = payload.role === undefined ? existing.role : asString(payload.role, 20);
  const accountStatus = payload.accountStatus === undefined ? existing.accountStatus : asString(payload.accountStatus, 20);
  const inviteQuota = payload.inviteQuota === undefined ? Number(existing.inviteQuota) : Number(payload.inviteQuota);
  if (existing.role === "superadmin") {
    if (role !== "superadmin") throw new AuthError("系统超级管理员不能被撤销");
  } else if (!(role === "member" || role === "admin")) {
    throw new AuthError("只能任命管理员或恢复为普通成员");
  }
  if (!(accountStatus === "active" || accountStatus === "suspended")) throw new AuthError("账户状态无效");
  if (!Number.isInteger(inviteQuota) || inviteQuota < 0 || inviteQuota > 10_000) throw new AuthError("邀请额度必须是 0 到 10000 的整数");
  if (targetId === admin.id && (role !== existing.role || accountStatus !== existing.accountStatus)) {
    throw new AuthError("不能修改自己的角色或账户状态");
  }
  if (existing.role === "superadmin" && existing.accountStatus === "active" && accountStatus !== "active") {
    const activeAdmins = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE role = 'superadmin' AND account_status = 'active'")
      .first<{ count: number }>();
    if (Number(activeAdmins?.count ?? 0) <= 1) throw new AuthError("必须保留至少一个启用中的超级管理员");
  }

  await db.batch([
    db.prepare("UPDATE members SET role = ?, account_status = ?, invite_quota = ? WHERE id = ?")
      .bind(role, accountStatus, inviteQuota, targetId),
    ...(accountStatus === "suspended" ? [db.prepare("DELETE FROM sessions WHERE member_id = ?").bind(targetId)] : []),
  ]);
  await audit(admin, "update_member_administration", "member", targetId, { role, accountStatus, inviteQuota });
  return { role, accountStatus, inviteQuota };
}

export async function deleteAdminMember(targetId: string, admin: SessionMember) {
  await ensureDatabase();
  if (targetId === admin.id) throw new AuthError("不能删除自己的账户");
  const db = database();
  const existing = await db.prepare("SELECT id,email,display_name AS displayName,role,avatar_key AS avatarKey FROM members WHERE id = ?")
    .bind(targetId).first<{ id: string; email: string; displayName: string; role: string; avatarKey: string | null }>();
  if (!existing) throw new AuthError("成员不存在", 404);
  if (existing.role === "superadmin") throw new AuthError("系统超级管理员不能被删除", 403);

  await db.batch([
    db.prepare("DELETE FROM problems WHERE creator_id = ?").bind(targetId),
    db.prepare(`WITH RECURSIVE message_tree(id) AS (
      SELECT id FROM messages WHERE author_id = ?
      UNION
      SELECT child.id FROM messages child JOIN message_tree parent ON child.parent_id = parent.id
    ) DELETE FROM messages WHERE id IN (SELECT id FROM message_tree)`).bind(targetId),
    db.prepare("UPDATE admin_audit_logs SET admin_id = ? WHERE admin_id = ?").bind(admin.id, targetId),
    db.prepare("DELETE FROM members WHERE id = ?").bind(targetId),
  ]);
  await audit(admin, "delete_member", "member", targetId, { email: existing.email, displayName: existing.displayName });
  if (existing.avatarKey?.startsWith(`avatars/${targetId}/`)) {
    try { await mediaBucket().delete(existing.avatarKey); } catch { /* The account is deleted even if orphan cleanup is unavailable. */ }
  }
  return { deleted: true };
}
