import { asString, database, ensureDatabase } from "./runtime";
import { AppError } from "./errors";
import { constantTimeEqual, isAllowedRegistrationEmail, isEmail, REGISTRATION_EMAIL_DOMAINS_LABEL, secretDigest } from "./security";
import { verifyRegistrationCode } from "./verification";

const SESSION_COOKIE = "gaiyuan_session";
const SESSION_DAYS = 30;
const DUMMY_PASSWORD_SALT = "gaiyuan-login-dummy";
const DUMMY_PASSWORD_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export type MemberRole = "member" | "admin" | "superadmin";

type MemberRow = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  initials: string;
  role: MemberRole;
  accountStatus: "active" | "suspended";
  avatarUpdatedAt: string | null;
  inviteQuota: number;
  apiEnabled: number | boolean;
  apiQualified: number | boolean;
  createdAt: string;
  passwordSalt?: string;
  passwordHash?: string;
};

export type SessionMember = Omit<MemberRow, "passwordSalt" | "passwordHash">;

async function passwordDigest(password: string, salt: string) {
  return secretDigest(password, salt);
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(request: Request, sessionId: string, expiresAt: Date) {
  const secure = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")) === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearedSessionCookie(request: Request) {
  const secure = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")) === "https" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function memberFromRow(row: MemberRow): SessionMember {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    initials: row.initials,
    role: row.role,
    accountStatus: row.accountStatus,
    avatarUpdatedAt: row.avatarUpdatedAt,
    inviteQuota: Number(row.inviteQuota),
    apiEnabled: Boolean(row.apiEnabled),
    apiQualified: Boolean(row.apiQualified),
    createdAt: row.createdAt,
  };
}

export async function currentMember(request: Request): Promise<SessionMember | null> {
  await ensureDatabase();
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (!sessionId) return null;
  const row = await database()
    .prepare(`SELECT
      m.id,
      m.email,
      m.username,
      m.display_name AS displayName,
      m.initials,
      m.role,
      m.account_status AS accountStatus,
      m.avatar_updated_at AS avatarUpdatedAt,
      m.invite_quota AS inviteQuota
      ,m.api_enabled AS apiEnabled
      ,EXISTS(SELECT 1 FROM messages api_message WHERE api_message.author_id = m.id) AS apiQualified
      ,m.created_at AS createdAt
    FROM sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.id = ? AND s.expires_at > ? AND m.account_status = 'active'`)
    .bind(sessionId, new Date().toISOString())
    .first<MemberRow>();
  return row ? memberFromRow(row) : null;
}

export async function requireMember(request: Request) {
  const member = await currentMember(request);
  if (!member) throw new AuthError("请先登录", 401);
  return member;
}

export class AuthError extends AppError {}

export async function requireSuperadmin(request: Request) {
  const member = await requireMember(request);
  if (member.role !== "superadmin") throw new AuthError("需要超级管理员权限", 403);
  return member;
}

export async function requireAdmin(request: Request) {
  const member = await requireMember(request);
  if (member.role !== "admin" && member.role !== "superadmin") throw new AuthError("需要管理员权限", 403);
  return member;
}

export async function login(input: { email: unknown; password: unknown; remember?: unknown }) {
  await ensureDatabase();
  const email = asString(input.email, 180).toLocaleLowerCase();
  const password = asString(input.password, 200);
  const remember = input.remember !== false;
  if (!isEmail(email) || !password) throw new AuthError("邮箱或密码不正确", 401);
  const row = await database()
    .prepare(`SELECT
      id,
      email,
      username,
      display_name AS displayName,
      initials,
      role,
      account_status AS accountStatus,
      avatar_updated_at AS avatarUpdatedAt,
      invite_quota AS inviteQuota,
      api_enabled AS apiEnabled,
      EXISTS(SELECT 1 FROM messages api_message WHERE api_message.author_id = members.id) AS apiQualified,
      created_at AS createdAt,
      password_salt AS passwordSalt,
      password_hash AS passwordHash
    FROM members WHERE email = ?`)
    .bind(email)
    .first<MemberRow>();
  const digest = await passwordDigest(password, row?.passwordSalt ?? DUMMY_PASSWORD_SALT);
  if (!row?.passwordSalt || !row.passwordHash || !constantTimeEqual(digest, row.passwordHash ?? DUMMY_PASSWORD_HASH)) {
    throw new AuthError("邮箱或密码不正确", 401);
  }
  if (row.accountStatus !== "active") throw new AuthError("账户已停用，请联系管理员", 403);

  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (remember ? SESSION_DAYS : 1) * 24 * 60 * 60 * 1000);
  await database().batch([
    database().prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()),
    database().prepare("INSERT INTO sessions (id, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(sessionId, row.id, expiresAt.toISOString(), now.toISOString()),
  ]);
  return { member: memberFromRow(row), sessionId, expiresAt };
}

export async function logout(request: Request) {
  await ensureDatabase();
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await database().prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

function initialsFor(username: string) {
  const latin = username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  return latin || username.slice(0, 2).toUpperCase();
}

export async function register(input: Record<string, unknown>) {
  await ensureDatabase();
  const inviteCode = asString(input.inviteCode, 40).toUpperCase();
  const email = asString(input.email, 180).toLocaleLowerCase();
  const emailCode = asString(input.emailCode, 6);
  const username = asString(input.username, 32);
  const password = asString(input.password, 200);
  const confirmPassword = asString(input.confirmPassword, 200);

  if (!inviteCode || !email || !username || !password) throw new AuthError("请填写全部注册信息");
  if (!isAllowedRegistrationEmail(email)) throw new AuthError(`仅支持 ${REGISTRATION_EMAIL_DOMAINS_LABEL} 邮箱注册`);
  if (!/^[\p{L}\p{N}_-]{2,32}$/u.test(username)) throw new AuthError("用户名只能包含文字、数字、下划线或连字符");
  if (password.length < 8) throw new AuthError("密码至少需要 8 位");
  if (password !== confirmPassword) throw new AuthError("两次输入的密码不一致");

  const db = database();
  const invitation = await db
    .prepare(`SELECT invitation.code FROM invitation_codes invitation
      JOIN members inviter ON inviter.id = invitation.created_by
      WHERE invitation.code = ? AND invitation.remaining_uses > 0
        AND invitation.revoked_at IS NULL AND inviter.invite_quota > 0`)
    .bind(inviteCode)
    .first<{ code: string }>();
  if (!invitation) throw new AuthError("邀请码无效、额度已用完、已作废或邀请名额已用完");
  const duplicate = await db
    .prepare("SELECT id FROM members WHERE email = ? OR username = ?")
    .bind(email, username)
    .first<{ id: string }>();
  if (duplicate) throw new AuthError("邮箱或用户名已经存在");
  const verification = await verifyRegistrationCode(email, inviteCode, emailCode);

  const memberId = `member-${crypto.randomUUID()}`;
  const salt = crypto.randomUUID();
  const hash = await passwordDigest(password, salt);
  const createdAt = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO members (
        id,email,username,display_name,initials,bio,location,public_email,specialties,role,account_status,registration_invite_code,invite_quota,password_salt,password_hash,created_at
      ) VALUES (?, ?, ?, ?, ?, '', '', '', '[]', 'member', 'active', ?, 0, ?, ?, ?)`)
        .bind(memberId, email, username, username, initialsFor(username), inviteCode, salt, hash, createdAt),
      db.prepare(`UPDATE invitation_codes SET used_by = ?, used_at = ?
        WHERE code = ? AND revoked_at IS NULL`)
        .bind(memberId, createdAt, inviteCode),
      db.prepare(`INSERT INTO invitation_code_uses (id,code,member_id,used_at) VALUES (?,?,?,?)`)
        .bind(`invitation-use-${crypto.randomUUID()}`, inviteCode, memberId, createdAt),
      db.prepare("UPDATE email_verification_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .bind(createdAt, verification.id),
    ]);
  } catch (error) {
    if (error instanceof Error && /INVITATION_UNAVAILABLE/i.test(error.message)) {
      throw new AuthError("邀请码无效、额度已用完、已作废或邀请名额已用完", 409);
    }
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
      throw new AuthError("邮箱或用户名已经被使用", 409);
    }
    throw error;
  }
  return login({ email, password, remember: true });
}
