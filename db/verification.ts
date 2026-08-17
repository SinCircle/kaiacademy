import type { VerificationEmailConfig } from "../email/verification-email";
import { sendVerificationEmail } from "../email/verification-email";
import { AppError } from "./errors";
import { asString, database, ensureDatabase } from "./runtime";
import { constantTimeEqual, isAllowedRegistrationEmail, randomNumericCode, REGISTRATION_EMAIL_DOMAINS_LABEL, secretDigest } from "./security";

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_EMAIL_SENDS_PER_HOUR = 5;
const MAX_INVITE_SENDS_PER_HOUR = 12;
const MAX_CODE_ATTEMPTS = 5;
const CODE_HASH_ITERATIONS = 60_000;

type VerificationRow = {
  id: string;
  codeSalt: string;
  codeHash: string;
  attempts: number;
  expiresAt: string;
};

export async function requestRegistrationCode(input: Record<string, unknown>, config: VerificationEmailConfig) {
  await ensureDatabase();
  const inviteCode = asString(input.inviteCode, 40).toUpperCase();
  const email = asString(input.email, 180).toLocaleLowerCase();
  if (!inviteCode) throw new AppError("请先填写邀请码");
  if (!isAllowedRegistrationEmail(email)) throw new AppError(`仅支持 ${REGISTRATION_EMAIL_DOMAINS_LABEL} 邮箱注册`);

  const db = database();
  const invitation = await db
    .prepare(`SELECT invitation.code FROM invitation_codes invitation
      JOIN members inviter ON inviter.id = invitation.created_by
      WHERE invitation.code = ? AND invitation.remaining_uses > 0
        AND invitation.revoked_at IS NULL AND inviter.invite_quota > 0`)
    .bind(inviteCode)
    .first<{ code: string }>();
  if (!invitation) throw new AppError("邀请码无效、额度已用完、已作废或邀请名额已用完");

  const existingMember = await db.prepare("SELECT id FROM members WHERE email = ?").bind(email).first();
  if (existingMember) throw new AppError("该邮箱已经注册");

  const now = new Date();
  const cooldownStart = new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const [latest, emailCount, inviteCount] = await Promise.all([
    db.prepare(`SELECT created_at AS createdAt FROM email_verification_codes
      WHERE email = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`)
      .bind(email, cooldownStart).first<{ createdAt: string }>(),
    db.prepare("SELECT COUNT(*) AS count FROM email_verification_codes WHERE email = ? AND created_at >= ?")
      .bind(email, hourStart).first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM email_verification_codes WHERE invite_code = ? AND created_at >= ?")
      .bind(inviteCode, hourStart).first<{ count: number }>(),
  ]);
  if (latest) throw new AppError("请等待 60 秒后重新发送", 429);
  if (Number(emailCount?.count ?? 0) >= MAX_EMAIL_SENDS_PER_HOUR) throw new AppError("发送次数过多，请一小时后重试", 429);
  if (Number(inviteCount?.count ?? 0) >= MAX_INVITE_SENDS_PER_HOUR) throw new AppError("该邀请码请求次数过多，请一小时后重试", 429);

  const id = `verification-${crypto.randomUUID()}`;
  const code = randomNumericCode();
  const salt = crypto.randomUUID();
  const hash = await secretDigest(code, salt, CODE_HASH_ITERATIONS);
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  await db.prepare(`INSERT INTO email_verification_codes
    (id,email,invite_code,code_salt,code_hash,attempts,provider_id,sent_at,expires_at,consumed_at,created_at)
    VALUES (?,?,?,?,?,0,NULL,NULL,?,NULL,?)`)
    .bind(id, email, inviteCode, salt, hash, expiresAt, createdAt).run();

  try {
    const delivery = await sendVerificationEmail(config, {
      to: email,
      code,
      requestId: id,
      expiresInMinutes: CODE_TTL_MINUTES,
    });
    const sentAt = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE email_verification_codes SET provider_id = ?, sent_at = ? WHERE id = ?")
        .bind(delivery.id, sentAt, id),
      db.prepare(`UPDATE email_verification_codes SET consumed_at = ?
        WHERE email = ? AND invite_code = ? AND id != ? AND consumed_at IS NULL`)
        .bind(sentAt, email, inviteCode, id),
    ]);
  } catch (error) {
    await db.prepare("DELETE FROM email_verification_codes WHERE id = ? AND sent_at IS NULL").bind(id).run();
    throw error;
  }

  return { sent: true, expiresInSeconds: CODE_TTL_MINUTES * 60, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
}

export async function verifyRegistrationCode(emailValue: unknown, inviteValue: unknown, codeValue: unknown) {
  await ensureDatabase();
  const email = asString(emailValue, 180).toLocaleLowerCase();
  const inviteCode = asString(inviteValue, 40).toUpperCase();
  const code = asString(codeValue, 6);
  if (!/^\d{6}$/.test(code)) throw new AppError("邮箱验证码应为 6 位数字");

  const db = database();
  const row = await db.prepare(`SELECT
      id,code_salt AS codeSalt,code_hash AS codeHash,attempts,expires_at AS expiresAt
    FROM email_verification_codes
    WHERE email = ? AND invite_code = ? AND sent_at IS NOT NULL AND consumed_at IS NULL
    ORDER BY created_at DESC LIMIT 1`)
    .bind(email, inviteCode)
    .first<VerificationRow>();
  if (!row || row.expiresAt <= new Date().toISOString()) throw new AppError("验证码无效或已过期");
  if (Number(row.attempts) >= MAX_CODE_ATTEMPTS) throw new AppError("验证码尝试次数过多，请重新获取", 429);

  const digest = await secretDigest(code, row.codeSalt, CODE_HASH_ITERATIONS);
  if (!constantTimeEqual(digest, row.codeHash)) {
    await db.prepare("UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    throw new AppError("验证码不正确");
  }
  return { id: row.id, email, inviteCode };
}
