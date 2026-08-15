import type { VerificationEmailConfig } from "../email/verification-email";
import { sendVerificationEmail } from "../email/verification-email";
import { AppError } from "./errors";
import { asString, database, ensureDatabase } from "./runtime";
import { constantTimeEqual, isAllowedRegistrationEmail, randomNumericCode, REGISTRATION_EMAIL_DOMAINS_LABEL, secretDigest } from "./security";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_EMAIL_SENDS_PER_HOUR = 5;
const MAX_CODE_ATTEMPTS = 5;
const CODE_HASH_ITERATIONS = 60_000;

type ResetRow = {
  id: string;
  memberId: string;
  codeSalt: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
};

export async function requestPasswordResetCode(emailValue: unknown, config: VerificationEmailConfig) {
  await ensureDatabase();
  const email = asString(emailValue, 180).toLocaleLowerCase();
  if (!isAllowedRegistrationEmail(email)) throw new AppError(`仅支持 ${REGISTRATION_EMAIL_DOMAINS_LABEL} 邮箱`);

  const db = database();
  const member = await db.prepare("SELECT id FROM members WHERE email = ? AND account_status = 'active'")
    .bind(email).first<{ id: string }>();
  const code = randomNumericCode();
  const salt = crypto.randomUUID();
  const hash = await secretDigest(code, salt, CODE_HASH_ITERATIONS);
  const genericResult = { sent: true, expiresInSeconds: CODE_TTL_MINUTES * 60, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
  if (!member) return genericResult;

  const now = new Date();
  const cooldownStart = new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const [latest, emailCount] = await Promise.all([
    db.prepare(`SELECT created_at AS createdAt FROM password_reset_codes
      WHERE email = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`)
      .bind(email, cooldownStart).first<{ createdAt: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM password_reset_codes WHERE email = ? AND created_at >= ?")
      .bind(email, hourStart).first<{ count: number }>(),
  ]);
  if (latest) throw new AppError("请等待 60 秒后重新发送", 429);
  if (Number(emailCount?.count ?? 0) >= MAX_EMAIL_SENDS_PER_HOUR) throw new AppError("发送次数过多，请一小时后重试", 429);

  const id = `password-reset-${crypto.randomUUID()}`;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  await db.prepare(`INSERT INTO password_reset_codes
    (id,member_id,email,code_salt,code_hash,attempts,provider_id,sent_at,expires_at,consumed_at,created_at)
    VALUES (?,?,?,?,?,0,NULL,NULL,?,NULL,?)`)
    .bind(id, member.id, email, salt, hash, expiresAt, createdAt).run();

  try {
    const delivery = await sendVerificationEmail(config, {
      to: email,
      code,
      requestId: id,
      expiresInMinutes: CODE_TTL_MINUTES,
      purpose: "password-reset",
    });
    const sentAt = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE password_reset_codes SET provider_id = ?, sent_at = ? WHERE id = ?").bind(delivery.id, sentAt, id),
      db.prepare(`UPDATE password_reset_codes SET consumed_at = ?
        WHERE email = ? AND id != ? AND consumed_at IS NULL`).bind(sentAt, email, id),
    ]);
  } catch (error) {
    await db.prepare("DELETE FROM password_reset_codes WHERE id = ? AND sent_at IS NULL").bind(id).run();
    throw error;
  }
  return genericResult;
}

export async function resetPassword(input: Record<string, unknown>) {
  await ensureDatabase();
  const email = asString(input.email, 180).toLocaleLowerCase();
  const code = asString(input.emailCode, 6);
  const password = asString(input.password, 200);
  const confirmPassword = asString(input.confirmPassword, 200);
  if (!isAllowedRegistrationEmail(email) || !/^\d{6}$/.test(code)) throw new AppError("邮箱或验证码无效");
  if (password.length < 8) throw new AppError("密码至少需要 8 位");
  if (password !== confirmPassword) throw new AppError("两次输入的密码不一致");

  const db = database();
  const row = await db.prepare(`SELECT id,member_id AS memberId,code_salt AS codeSalt,code_hash AS codeHash,attempts,expires_at AS expiresAt
    FROM password_reset_codes WHERE email = ? AND sent_at IS NOT NULL AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1`).bind(email).first<ResetRow>();
  if (!row || row.expiresAt <= new Date().toISOString()) throw new AppError("验证码无效或已过期");
  if (Number(row.attempts) >= MAX_CODE_ATTEMPTS) throw new AppError("验证码尝试次数过多，请重新获取", 429);

  const codeHash = await secretDigest(code, row.codeSalt, CODE_HASH_ITERATIONS);
  if (!constantTimeEqual(codeHash, row.codeHash)) {
    await db.prepare("UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw new AppError("验证码不正确");
  }

  const passwordSalt = crypto.randomUUID();
  const passwordHash = await secretDigest(password, passwordSalt);
  const consumedAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE members SET password_salt = ?, password_hash = ? WHERE id = ?").bind(passwordSalt, passwordHash, row.memberId),
    db.prepare("UPDATE password_reset_codes SET consumed_at = ? WHERE member_id = ? AND consumed_at IS NULL").bind(consumedAt, row.memberId),
    db.prepare("DELETE FROM sessions WHERE member_id = ?").bind(row.memberId),
  ]);
  return { ok: true };
}
