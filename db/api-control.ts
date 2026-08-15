import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { database, ensureDatabase } from "./runtime";

type ApiControlRow = {
  enabled: number;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
};

export async function apiGlobalStatus() {
  await ensureDatabase();
  const db = database();
  await db.prepare("INSERT OR IGNORE INTO api_global_control (id,enabled,changed_by,changed_at) VALUES ('global',1,NULL,?)")
    .bind("2026-08-14T00:00:00.000Z").run();
  const row = await db.prepare(`SELECT control.enabled,control.changed_at AS changedAt,
      control.changed_by AS changedBy,member.display_name AS changedByName
    FROM api_global_control control
    LEFT JOIN members member ON member.id = control.changed_by
    WHERE control.id = 'global'`).first<ApiControlRow>();
  return {
    enabled: row ? Boolean(row.enabled) : true,
    changedAt: row?.changedAt ?? null,
    changedBy: row?.changedBy ?? null,
    changedByName: row?.changedByName ?? null,
  };
}

export async function setApiGlobalStatus(admin: SessionMember, enabled: boolean) {
  await ensureDatabase();
  if (enabled && admin.role !== "superadmin") throw new AuthError("只有超级管理员可以重新开启 API", 403);
  const current = await apiGlobalStatus();
  if (current.enabled === enabled) return current;
  const changedAt = new Date().toISOString();
  const db = database();
  await db.batch([
    db.prepare("UPDATE api_global_control SET enabled = ?, changed_by = ?, changed_at = ? WHERE id = 'global'")
      .bind(enabled ? 1 : 0, admin.id, changedAt),
    db.prepare(`INSERT INTO admin_audit_logs
      (id,admin_id,action,target_type,target_id,detail,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(`audit-${crypto.randomUUID()}`, admin.id, enabled ? "enable_api" : "disable_api", "api", "global", JSON.stringify({ enabled }), changedAt),
  ]);
  return { enabled, changedAt, changedBy: admin.id, changedByName: admin.displayName };
}

export async function assertApiGloballyEnabled() {
  const control = await apiGlobalStatus();
  if (!control.enabled) throw new AuthError("API 功能已由管理员暂停", 503);
}
