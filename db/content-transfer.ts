import { AuthError } from "./auth";
import { asString, database } from "./runtime";

export type ContentTransferCandidate = {
  id: string;
  displayName: string;
  username: string;
  initials: string;
  avatarUpdatedAt: string | null;
};

type ContentOwnerViewer = {
  id: string;
  role: "member" | "admin" | "superadmin";
};

export function canActAsContentCreator(viewer: ContentOwnerViewer, currentOwnerId: string) {
  return viewer.id === currentOwnerId || viewer.role === "superadmin";
}

export async function searchActiveTransferCandidates(currentOwnerId: string, queryValue: unknown) {
  const query = asString(queryValue, 80);
  if (!query) return [];
  const target = `%${query.replace(/[%_]/g, "")}%`;
  const rows = await database().prepare(`SELECT id,display_name AS displayName,username,initials,avatar_updated_at AS avatarUpdatedAt
    FROM members WHERE id != ? AND account_status = 'active'
      AND (display_name LIKE ? OR username LIKE ?)
    ORDER BY CASE WHEN display_name = ? OR username = ? THEN 0 ELSE 1 END,display_name LIMIT 12`)
    .bind(currentOwnerId, target, target, query, query).all<ContentTransferCandidate>();
  return rows.results;
}

export async function requireActiveTransferTarget(currentOwnerId: string, targetMemberIdValue: unknown) {
  const targetMemberId = asString(targetMemberIdValue, 100);
  if (!targetMemberId || targetMemberId === currentOwnerId) throw new AuthError("请选择其他成员");
  const target = await database().prepare("SELECT id FROM members WHERE id = ? AND account_status = 'active'")
    .bind(targetMemberId).first<{ id: string }>();
  if (!target) throw new AuthError("目标成员不存在或账户不可用", 404);
  return target;
}
