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
    apiEnabled: integer("api_enabled", { mode: "boolean" }).notNull().default(false),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_members_email").on(table.email),
    uniqueIndex("idx_members_username").on(table.username),
    index("idx_members_registration_invite_code").on(table.registrationInviteCode),
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

export const dailyCheckins = sqliteTable(
  "daily_checkins",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    drawDate: text("draw_date").notNull(),
    symbols: text("symbols").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_daily_checkins_member_date").on(table.memberId, table.drawDate),
    index("idx_daily_checkins_member_created").on(table.memberId, table.createdAt),
  ],
);

export const invitationCodes = sqliteTable(
  "invitation_codes",
  {
    code: text("code").primaryKey(),
    createdBy: text("created_by").notNull().references(() => members.id, { onDelete: "cascade" }),
    usedBy: text("used_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
    remainingUses: integer("remaining_uses").notNull().default(1),
  },
  (table) => [index("idx_invitation_codes_created_by").on(table.createdBy)],
);

export const invitationCodeUses = sqliteTable(
  "invitation_code_uses",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().references(() => invitationCodes.code, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    usedAt: text("used_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_invitation_code_uses_member").on(table.memberId),
    index("idx_invitation_code_uses_code_used").on(table.code, table.usedAt),
  ],
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

export const passwordResetCodes = sqliteTable(
  "password_reset_codes",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    codeSalt: text("code_salt").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    sentAt: text("sent_at"),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_password_reset_email_created").on(table.email, table.createdAt)],
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

export const messageAttachments = sqliteTable(
  "message_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    storageKey: text("storage_key").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_message_attachments_message_id").on(table.messageId),
    uniqueIndex("idx_message_attachments_storage_key").on(table.storageKey),
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

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.memberId, table.emoji] }), index("idx_message_reactions_member_id").on(table.memberId)],
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

export const playgroundPosts = sqliteTable(
  "playground_posts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorId: text("author_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_playground_posts_updated_at").on(table.updatedAt), index("idx_playground_posts_author_id").on(table.authorId)],
);

export const playgroundShareTokens = sqliteTable(
  "playground_share_tokens",
  {
    postId: text("post_id").primaryKey().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: text("created_by").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("idx_playground_share_tokens_token").on(table.token)],
);

export const problemShareTokens = sqliteTable(
  "problem_share_tokens",
  {
    problemId: text("problem_id").primaryKey().references(() => problems.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: text("created_by").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [uniqueIndex("idx_problem_share_tokens_token").on(table.token)],
);

export const playgroundTags = sqliteTable(
  "playground_tags",
  {
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tag] }), index("idx_playground_tags_tag").on(table.tag)],
);

export const playgroundResources = sqliteTable(
  "playground_resources",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["upload", "external"] }).notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    storageKey: text("storage_key"),
    externalUrl: text("external_url"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    sha256: text("sha256"),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_playground_resources_post_id").on(table.postId), uniqueIndex("idx_playground_resources_storage_key").on(table.storageKey)],
);

export const playgroundPostVotes = sqliteTable(
  "playground_post_votes",
  {
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.memberId] })],
);

export const playgroundBookmarks = sqliteTable(
  "playground_bookmarks",
  {
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.memberId] }), index("idx_playground_bookmarks_member_id").on(table.memberId)],
);

export const playgroundComments = sqliteTable(
  "playground_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    authorId: text("author_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    marker: text("marker"),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    upvotes: integer("upvotes").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_playground_comments_post_parent").on(table.postId, table.parentId), index("idx_playground_comments_author_id").on(table.authorId)],
);

export const playgroundCommentReactions = sqliteTable(
  "playground_comment_reactions",
  {
    commentId: text("comment_id").notNull().references(() => playgroundComments.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.memberId, table.emoji] }), index("idx_playground_comment_reactions_member_id").on(table.memberId)],
);

export const playgroundViews = sqliteTable(
  "playground_views",
  {
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    viewerKey: text("viewer_key").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.viewerKey, table.windowStartedAt] }), index("idx_playground_views_post_id").on(table.postId)],
);

export const playgroundInteractions = sqliteTable(
  "playground_interactions",
  {
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    firstInteractedAt: text("first_interacted_at").notNull(),
    lastInteractedAt: text("last_interacted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.memberId] }), index("idx_playground_interactions_member_id").on(table.memberId)],
);

export const playgroundCommentVotes = sqliteTable(
  "playground_comment_votes",
  {
    commentId: text("comment_id").notNull().references(() => playgroundComments.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.memberId] })],
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

export const playgroundNotifications = sqliteTable(
  "playground_notifications",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    postId: text("post_id").notNull().references(() => playgroundPosts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (table) => [index("idx_playground_notifications_member_read_created").on(table.memberId, table.readAt, table.createdAt)],
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

export const apiGlobalControl = sqliteTable("api_global_control", {
  id: text("id").primaryKey(),
  enabled: integer("enabled").notNull().default(1),
  changedBy: text("changed_by").references(() => members.id, { onDelete: "set null" }),
  changedAt: text("changed_at").notNull(),
});

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    secretHash: text("secret_hash").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretSuffix: text("secret_suffix").notNull(),
    permissions: text("permissions").notNull().default("[]"),
    status: text("status", { enum: ["active", "isolated", "revoked"] }).notNull().default("active"),
    scopeViolationCount: integer("scope_violation_count").notNull().default(0),
    lastScopeViolationAt: text("last_scope_violation_at"),
    isolatedAt: text("isolated_at"),
    isolationReason: text("isolation_reason"),
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_api_keys_secret_hash").on(table.secretHash),
    uniqueIndex("idx_api_keys_member_name").on(table.memberId, table.name),
    index("idx_api_keys_member_status").on(table.memberId, table.status),
  ],
);

export const apiRequests = sqliteTable(
  "api_requests",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["create_problem", "update_own_problem", "create_direct_message", "create_playground_post", "update_own_playground_post"] }).notNull(),
    problemId: text("problem_id").references(() => problems.id, { onDelete: "set null" }),
    playgroundPostId: text("playground_post_id").references(() => playgroundPosts.id, { onDelete: "set null" }),
    payload: text("payload").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "failed"] }).notNull().default("pending"),
    resultId: text("result_id"),
    error: text("error"),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at"),
  },
  (table) => [
    index("idx_api_requests_member_status_created").on(table.memberId, table.status, table.createdAt),
    index("idx_api_requests_key_created").on(table.apiKeyId, table.createdAt),
  ],
);

export const apiStagedUploads = sqliteTable(
  "api_staged_uploads",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    requestId: text("request_id").references(() => apiRequests.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_api_staged_uploads_storage_key").on(table.storageKey),
    index("idx_api_staged_uploads_member_expires").on(table.memberId, table.expiresAt),
    index("idx_api_staged_uploads_request").on(table.requestId),
  ],
);

export const apiCallLogs = sqliteTable(
  "api_call_logs",
  {
    id: text("id").primaryKey(),
    apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    requestId: text("request_id").references(() => apiRequests.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_api_call_logs_key_created").on(table.apiKeyId, table.createdAt),
    index("idx_api_call_logs_member_created").on(table.memberId, table.createdAt),
  ],
);
