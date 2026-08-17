import type { SessionMember } from "./auth";
import { AppError } from "./errors";
import { database, ensureDatabase } from "./runtime";

const SHARE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function createToken() {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function getOrCreateProblemShareToken(problemId: string, member: SessionMember) {
  await ensureDatabase();
  const db = database();
  const problem = await db.prepare("SELECT id FROM problems WHERE id = ? AND is_hidden = 0")
    .bind(problemId)
    .first<{ id: string }>();
  if (!problem) throw new AppError("问题不存在", 404);

  const existing = await db.prepare(`SELECT token FROM problem_share_tokens
    WHERE problem_id = ? AND revoked_at IS NULL`)
    .bind(problemId)
    .first<{ token: string }>();
  if (existing?.token && SHARE_TOKEN_PATTERN.test(existing.token)) return existing.token;

  const token = createToken();
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO problem_share_tokens (problem_id,token,created_by,created_at,revoked_at)
    VALUES (?,?,?,?,NULL)
    ON CONFLICT(problem_id) DO UPDATE SET
      token = excluded.token,
      created_by = excluded.created_by,
      created_at = excluded.created_at,
      revoked_at = NULL`)
    .bind(problemId, token, member.id, createdAt)
    .run();
  return token;
}

export async function isValidProblemShareToken(problemId: string, token: string | null | undefined) {
  if (!token || !SHARE_TOKEN_PATTERN.test(token)) return false;
  await ensureDatabase();
  const row = await database().prepare(`SELECT 1 AS valid
    FROM problem_share_tokens share
    JOIN problems problem ON problem.id = share.problem_id
    WHERE share.problem_id = ?
      AND share.token = ?
      AND share.revoked_at IS NULL
      AND problem.is_hidden = 0`)
    .bind(problemId, token)
    .first<{ valid: number }>();
  return Boolean(row?.valid);
}
