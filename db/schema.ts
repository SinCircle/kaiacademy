import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    initials: text("initials").notNull(),
    bio: text("bio").notNull().default(""),
    location: text("location").notNull().default(""),
    publicEmail: text("public_email").notNull().default(""),
    specialties: text("specialties").notNull().default("[]"),
    role: text("role", { enum: ["member", "admin", "superadmin"] }).notNull().default("member"),
    accountStatus: text("account_status").notNull().default("active"),
    registrationInviteCode: text("registration_invite_code"),
    avatarKey: text("avatar_key"),
    avatarUpdatedAt: text("avatar_updated_at"),
    inviteQuota: integer("invite_quota").notNull().default(0),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_members_email").on(table.email),
    uniqueIndex("idx_members_username").on(table.username),
    uniqueIndex("idx_members_registration_invite_code").on(table.registrationInviteCode),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_sessions_member_id").on(table.memberId), index("idx_sessions_expires_at").on(table.expiresAt)],
);

export const invitationCodes = sqliteTable(
  "invitation_codes",
  {
    code: text("code").primaryKey(),
    createdBy: text("created_by").notNull().references(() => members.id, { onDelete: "cascade" }),
    usedBy: text("used_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
  },
  (table) => [index("idx_invitation_codes_created_by").on(table.createdBy)],
);

export const emailVerificationCodes = sqliteTable(
  "email_verification_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    inviteCode: text("invite_code").notNull(),
    codeSalt: text("code_salt").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    sentAt: text("sent_at"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_email_verification_email_created").on(table.email, table.createdAt),
    index("idx_email_verification_invite_created").on(table.inviteCode, table.createdAt),
  ],
);

export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    shortCode: text("short_code").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    background: text("background").notNull().default(""),
    status: text("status").notNull().default("开放"),
    creatorId: text("creator_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("idx_problems_short_code").on(table.shortCode),
    index("idx_problems_status_updated_at").on(table.status, table.updatedAt),
    index("idx_problems_creator_id").on(table.creatorId),
  ],
);

export const problemTags = sqliteTable(
  "problem_tags",
  {
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.problemId, table.tag] }), index("idx_problem_tags_tag").on(table.tag)],
);

export const problemMembers = sqliteTable(
  "problem_members",
  {
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    relation: text("relation").notNull().default("following"),
    isManager: integer("is_manager", { mode: "boolean" }).notNull().default(false),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.problemId, table.memberId] }),
    index("idx_problem_members_member_relation").on(table.memberId, table.relation),
    index("idx_problem_members_problem_relation").on(table.problemId, table.relation),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    authorId: text("author_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    kind: text("kind"),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    isAdopted: integer("is_adopted", { mode: "boolean" }).notNull().default(false),
    upvotes: integer("upvotes").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_messages_problem_parent").on(table.problemId, table.parentId),
    index("idx_messages_author_id").on(table.authorId),
  ],
);

export const messageVotes = sqliteTable(
  "message_votes",
  {
    messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.memberId] })],
);

export const problemViews = sqliteTable(
  "problem_views",
  {
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    viewedAt: text("viewed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.problemId, table.memberId] }),
    index("idx_problem_views_member_viewed").on(table.memberId, table.viewedAt),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull().references(() => problems.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (table) => [index("idx_notifications_member_read_created").on(table.memberId, table.readAt, table.createdAt)],
);

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_admin_audit_admin_created").on(table.adminId, table.createdAt),
    index("idx_admin_audit_target_created").on(table.targetType, table.targetId, table.createdAt),
  ],
);
