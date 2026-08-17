import type { SessionMember } from "./auth";
import { AppError } from "./errors";
import { database, ensureDatabase } from "./runtime";

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function createToken() {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function getOrCreatePlaygroundShareToken(postId: string, member: SessionMember) {
  await ensureDatabase();
  const db = database();
  const post = await db.prepare("SELECT id FROM playground_posts WHERE id = ? AND is_hidden = 0")
    .bind(postId)
    .first<{ id: string }>();
  if (!post) throw new AppError("内容不存在", 404);

  const existing = await db.prepare(`SELECT token FROM playground_share_tokens
    WHERE post_id = ? AND revoked_at IS NULL`)
    .bind(postId)
    .first<{ token: string }>();
  if (existing?.token && SHARE_TOKEN_PATTERN.test(existing.token)) return existing.token;

  const token = createToken();
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO playground_share_tokens (post_id,token,created_by,created_at,revoked_at)
    VALUES (?,?,?,?,NULL)
    ON CONFLICT(post_id) DO UPDATE SET
      token = excluded.token,
      created_by = excluded.created_by,
      created_at = excluded.created_at,
      revoked_at = NULL`)
    .bind(postId, token, member.id, createdAt)
    .run();
  return token;
}

export async function isValidPlaygroundShareToken(postId: string, token: string | null | undefined) {
  if (!token || !SHARE_TOKEN_PATTERN.test(token)) return false;
  await ensureDatabase();
  const row = await database().prepare(`SELECT 1 AS valid
    FROM playground_share_tokens share
    JOIN playground_posts post ON post.id = share.post_id
    WHERE share.post_id = ?
      AND share.token = ?
      AND share.revoked_at IS NULL
      AND post.is_hidden = 0`)
    .bind(postId, token)
    .first<{ valid: number }>();
  return Boolean(row?.valid);
}
