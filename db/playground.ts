import {
  MAX_PLAYGROUND_RESOURCE_DESCRIPTION,
  MAX_PLAYGROUND_RESOURCE_NAME,
  MAX_PLAYGROUND_RESOURCES,
  MAX_PLAYGROUND_UPLOAD_BYTES,
  PLAYGROUND_COMMENT_MARKERS,
  isPlaygroundCommentMarker,
  playgroundViewWindowStart,
  normalizeExternalResourceUrl,
  resourceExtension,
  validatePlaygroundUpload,
  type DraftExternalResource,
  type PlaygroundComment,
  type PlaygroundCommentReaction,
  type PlaygroundDetailData,
  type PlaygroundPostCard,
  type PlaygroundResource,
} from "../app/lib/playground";
import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { canActAsContentCreator, requireActiveTransferTarget, searchActiveTransferCandidates } from "./content-transfer";
import { mediaBucket } from "./media";
import { asString, database, ensureDatabase, jsonArray } from "./runtime";

type UploadDraft = { file: File; description: string };
export type StoredResource = {
  id: string;
  postId: string;
  kind: "upload" | "external";
  displayName: string;
  description: string;
  storageKey: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  byteSize: number | null;
  sha256: string | null;
  downloadCount: number;
  createdAt: string;
};

function textValue(value: unknown, label: string, max: number, required = true) {
  if (typeof value !== "string") {
    if (!required) return "";
    throw new AuthError(`请填写${label}`);
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (required && !normalized) throw new AuthError(`请填写${label}`);
  if (normalized.length > max) throw new AuthError(`${label}不能超过 ${max} 个字符`);
  return normalized;
}

function normalizeTags(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[，,]/) : [];
  const tags = [...new Set(values.map((tag) => typeof tag === "string" ? tag.trim() : "").filter(Boolean))];
  if (tags.length > 8) throw new AuthError("每篇内容最多添加 8 个标签");
  if (tags.some((tag) => tag.length > 30 || [...tag].some((character) => character.charCodeAt(0) < 32))) throw new AuthError("每个标签不能超过 30 个字符");
  return tags;
}

function normalizeExternalResources(value: unknown) {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new AuthError("外部资源格式无效");
  return value.map((entry): DraftExternalResource => {
    if (!entry || typeof entry !== "object") throw new AuthError("外部资源格式无效");
    const record = entry as Record<string, unknown>;
    const displayName = textValue(record.displayName, "资源标题", MAX_PLAYGROUND_RESOURCE_NAME);
    const description = textValue(record.description, "资源说明", MAX_PLAYGROUND_RESOURCE_DESCRIPTION, false);
    const url = normalizeExternalResourceUrl(typeof record.url === "string" ? record.url : "");
    if (!url) throw new AuthError("外部资源必须使用有效的 HTTP 或 HTTPS 地址");
    return { displayName, description, url };
  });
}

export function normalizePlaygroundPostPayload(payload: Record<string, unknown>) {
  return {
    title: textValue(payload.title, "标题", 160),
    body: textValue(payload.body, "正文", 100_000),
    tags: normalizeTags(payload.tags),
    externalResources: normalizeExternalResources(payload.externalResources),
  };
}

export function playgroundFileDisplayName(filename: string) {
  return [...filename.replace(/[/\\]/g, "-")].filter((character) => character.charCodeAt(0) >= 32).join("").trim().slice(0, MAX_PLAYGROUND_RESOURCE_NAME);
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validatePlaygroundResourceSet(uploads: Array<{ name: string; size: number; type: string; description: string }>, externalCount: number, retainedBytes = 0, retainedCount = 0) {
  if (uploads.length + externalCount + retainedCount > MAX_PLAYGROUND_RESOURCES) {
    throw new AuthError(`每篇内容最多添加 ${MAX_PLAYGROUND_RESOURCES} 个资源`);
  }
  let total = retainedBytes;
  for (const upload of uploads) {
    const problem = validatePlaygroundUpload(upload);
    if (problem) throw new AuthError(`${upload.name}：${problem}`);
    if (upload.description.length > MAX_PLAYGROUND_RESOURCE_DESCRIPTION) throw new AuthError("文件说明不能超过 240 个字符");
    total += upload.size;
  }
  if (total > MAX_PLAYGROUND_UPLOAD_BYTES) throw new AuthError("单个帖子内的本地文件合计不能超过 10 MB");
}

async function stageUploads(postId: string, uploads: UploadDraft[], createdAt: string) {
  const records: StoredResource[] = [];
  const uploadedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const id = `playground-resource-${crypto.randomUUID()}`;
      const extension = resourceExtension(upload.file.name);
      const storageKey = `playground/${postId}/${id}.${extension}`;
      const bytes = await upload.file.arrayBuffer();
      const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
      await mediaBucket().put(storageKey, bytes, {
        httpMetadata: { contentType: upload.file.type || "application/octet-stream", cacheControl: "private, no-store" },
        customMetadata: { postId, resourceId: id },
      });
      uploadedKeys.push(storageKey);
      records.push({
        id,
        postId,
        kind: "upload",
        displayName: playgroundFileDisplayName(upload.file.name),
        description: upload.description,
        storageKey,
        externalUrl: null,
        mimeType: upload.file.type || "application/octet-stream",
        byteSize: upload.file.size,
        sha256,
        downloadCount: 0,
        createdAt,
      });
    }
    return { records, uploadedKeys };
  } catch (error) {
    await deletePlaygroundObjects(uploadedKeys);
    throw error;
  }
}

export function externalPlaygroundResourceRecords(postId: string, resources: DraftExternalResource[], createdAt: string): StoredResource[] {
  return resources.map((resource) => ({
    id: `playground-resource-${crypto.randomUUID()}`,
    postId,
    kind: "external",
    displayName: resource.displayName,
    description: resource.description,
    storageKey: null,
    externalUrl: resource.url,
    mimeType: null,
    byteSize: null,
    sha256: null,
    downloadCount: 0,
    createdAt,
  }));
}

export function playgroundResourceInsert(record: StoredResource) {
  return database().prepare(`INSERT INTO playground_resources
    (id,post_id,kind,display_name,description,storage_key,external_url,mime_type,byte_size,sha256,download_count,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      record.id, record.postId, record.kind, record.displayName, record.description, record.storageKey, record.externalUrl,
      record.mimeType, record.byteSize, record.sha256, record.downloadCount, record.createdAt,
    );
}

export async function deletePlaygroundObjects(keys: string[]) {
  if (!keys.length) return;
  try { await Promise.allSettled(keys.map((key) => mediaBucket().delete(key))); } catch { /* Database state remains authoritative. */ }
}

export async function createPlaygroundPost(member: SessionMember, payload: Record<string, unknown>, uploads: UploadDraft[]) {
  await ensureDatabase();
  const input = normalizePlaygroundPostPayload(payload);
  validatePlaygroundResourceSet(uploads.map((upload) => ({ name: upload.file.name, size: upload.file.size, type: upload.file.type, description: upload.description })), input.externalResources.length);
  const postId = `playground-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const staged = await stageUploads(postId, uploads, createdAt);
  const resources = [...staged.records, ...externalPlaygroundResourceRecords(postId, input.externalResources, createdAt)];
  try {
    await database().batch([
      database().prepare(`INSERT INTO playground_posts
        (id,title,body,author_id,is_hidden,is_pinned,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?)`)
        .bind(postId, input.title, input.body, member.id, createdAt, createdAt),
      ...input.tags.map((tag) => database().prepare("INSERT INTO playground_tags (post_id,tag) VALUES (?,?)").bind(postId, tag)),
      ...resources.map(playgroundResourceInsert),
    ]);
  } catch (error) {
    await deletePlaygroundObjects(staged.uploadedKeys);
    throw error;
  }
  return { id: postId };
}

export async function updatePlaygroundPost(postId: string, member: SessionMember, payload: Record<string, unknown>, uploads: UploadDraft[]) {
  await ensureDatabase();
  const existing = await database().prepare("SELECT id,author_id AS authorId FROM playground_posts WHERE id = ?")
    .bind(postId).first<{ id: string; authorId: string }>();
  if (!existing) throw new AuthError("内容不存在", 404);
  if (!canActAsContentCreator(member, existing.authorId)) throw new AuthError("只有创建者或超级管理员可以修改内容", 403);
  const input = normalizePlaygroundPostPayload(payload);
  const keepIds = Array.isArray(payload.keepResourceIds)
    ? [...new Set(payload.keepResourceIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const current = await database().prepare(`SELECT id,kind,storage_key AS storageKey,byte_size AS byteSize
    FROM playground_resources WHERE post_id = ?`).bind(postId).all<{ id: string; kind: string; storageKey: string | null; byteSize: number | null }>();
  if (keepIds.some((id) => !current.results.some((resource) => resource.id === id))) throw new AuthError("保留的资源不存在");
  const retained = current.results.filter((resource) => keepIds.includes(resource.id));
  validatePlaygroundResourceSet(
    uploads.map((upload) => ({ name: upload.file.name, size: upload.file.size, type: upload.file.type, description: upload.description })),
    input.externalResources.length,
    retained.reduce((sum, resource) => sum + (resource.kind === "upload" ? Number(resource.byteSize ?? 0) : 0), 0),
    retained.length,
  );
  const updatedAt = new Date().toISOString();
  const staged = await stageUploads(postId, uploads, updatedAt);
  const added = [...staged.records, ...externalPlaygroundResourceRecords(postId, input.externalResources, updatedAt)];
  const removed = current.results.filter((resource) => !keepIds.includes(resource.id));
  try {
    await database().batch([
      database().prepare("UPDATE playground_posts SET title = ?, body = ?, updated_at = ? WHERE id = ?")
        .bind(input.title, input.body, updatedAt, postId),
      database().prepare("DELETE FROM playground_tags WHERE post_id = ?").bind(postId),
      ...input.tags.map((tag) => database().prepare("INSERT INTO playground_tags (post_id,tag) VALUES (?,?)").bind(postId, tag)),
      ...removed.map((resource) => database().prepare("DELETE FROM playground_resources WHERE id = ? AND post_id = ?").bind(resource.id, postId)),
      ...added.map(playgroundResourceInsert),
    ]);
  } catch (error) {
    await deletePlaygroundObjects(staged.uploadedKeys);
    throw error;
  }
  await deletePlaygroundObjects(removed.map((resource) => resource.storageKey).filter((key): key is string => Boolean(key)));
  return { id: postId };
}

function plainSummary(body: string) {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~$|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

type ListOptions = {
  query?: string;
  type?: string;
  tag?: string;
  format?: string;
  sort?: string;
  viewerId?: string;
};

export async function listPlaygroundPosts(options: ListOptions): Promise<PlaygroundPostCard[]> {
  await ensureDatabase();
  const viewerId = options.viewerId ?? "";
  const clauses = ["p.is_hidden = 0"];
  const bindings: unknown[] = [viewerId, viewerId];
  if (options.type === "post") clauses.push("NOT EXISTS (SELECT 1 FROM playground_resources resource WHERE resource.post_id = p.id)");
  if (options.type === "resource") clauses.push("EXISTS (SELECT 1 FROM playground_resources resource WHERE resource.post_id = p.id)");
  const query = asString(options.query, 120).toLocaleLowerCase();
  if (query) {
    clauses.push(`(LOWER(p.title) LIKE ? OR LOWER(p.body) LIKE ? OR LOWER(author.display_name) LIKE ? OR
      EXISTS (SELECT 1 FROM playground_tags search_tag WHERE search_tag.post_id = p.id AND LOWER(search_tag.tag) LIKE ?) OR
      EXISTS (SELECT 1 FROM playground_resources search_resource WHERE search_resource.post_id = p.id AND LOWER(search_resource.display_name) LIKE ?))`);
    const pattern = `%${query}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }
  const tag = asString(options.tag, 30);
  if (tag) { clauses.push("EXISTS (SELECT 1 FROM playground_tags filter_tag WHERE filter_tag.post_id = p.id AND filter_tag.tag = ?)"); bindings.push(tag); }
  const format = asString(options.format, 20).toLocaleLowerCase();
  if (format) {
    clauses.push("EXISTS (SELECT 1 FROM playground_resources filter_resource WHERE filter_resource.post_id = p.id AND (LOWER(filter_resource.display_name) LIKE ? OR LOWER(COALESCE(filter_resource.mime_type,'')) LIKE ?))");
    bindings.push(`%.${format}`, `%${format}%`);
  }
  const order = options.sort === "latest" ? "p.created_at DESC"
    : options.sort === "comments" ? "commentCount DESC,p.updated_at DESC"
      : options.sort === "downloads" ? "downloadCount DESC,p.updated_at DESC"
        : "p.is_pinned DESC,upvotes DESC,p.updated_at DESC";
  const rows = await database().prepare(`SELECT p.id,p.title,p.body,p.author_id AS authorId,p.created_at AS createdAt,p.updated_at AS updatedAt,p.is_pinned AS isPinned,
      author.display_name AS authorName,author.username AS authorUsername,author.initials AS authorInitials,author.avatar_updated_at AS authorAvatarUpdatedAt,
      (SELECT COUNT(*) FROM playground_resources resource WHERE resource.post_id = p.id) AS resourceCount,
      (SELECT COALESCE(SUM(resource.byte_size),0) FROM playground_resources resource WHERE resource.post_id = p.id AND resource.kind = 'upload') AS uploadedBytes,
      (SELECT COUNT(*) FROM playground_comments comment WHERE comment.post_id = p.id) AS commentCount,
      (SELECT COUNT(*) FROM playground_post_votes vote WHERE vote.post_id = p.id) AS upvotes,
      (SELECT COUNT(*) FROM playground_bookmarks bookmark WHERE bookmark.post_id = p.id) AS bookmarkCount,
      (SELECT COALESCE(SUM(resource.download_count),0) FROM playground_resources resource WHERE resource.post_id = p.id) AS downloadCount,
      (SELECT COUNT(*) FROM playground_views visit WHERE visit.post_id = p.id) AS viewCount,
      EXISTS(SELECT 1 FROM playground_post_votes vote WHERE vote.post_id = p.id AND vote.member_id = ?) AS isVoted,
      EXISTS(SELECT 1 FROM playground_bookmarks bookmark WHERE bookmark.post_id = p.id AND bookmark.member_id = ?) AS isBookmarked
    FROM playground_posts p JOIN members author ON author.id = p.author_id
    WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 100`).bind(...bindings).all<{
      id: string; title: string; body: string; authorId: string; createdAt: string; updatedAt: string; isPinned: number;
      authorName: string; authorUsername: string; authorInitials: string; authorAvatarUpdatedAt: string | null;
      resourceCount: number; uploadedBytes: number; commentCount: number; upvotes: number; bookmarkCount: number; downloadCount: number; viewCount: number; isVoted: number; isBookmarked: number;
    }>();
  const ids = rows.results.map((row) => row.id);
  const tagsByPost = new Map<string, string[]>();
  const formatsByPost = new Map<string, string[]>();
  type InteractionPreview = { postId: string; id: string; initials: string; avatarUpdatedAt: string | null; role: string; isAuthor: number; firstInteraction: string; lastInteraction: string };
  const interactionMaps = new Map<string, Map<string, InteractionPreview>>();
  const interactionsByPost = new Map<string, Array<{ id: string; initials: string; avatarUpdatedAt: string | null }>>();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const [tags, resources, authors, postVotes, bookmarks, commentAuthors, commentVotes, durableInteractions] = await Promise.all([
      database().prepare(`SELECT post_id AS postId,tag FROM playground_tags WHERE post_id IN (${placeholders}) ORDER BY tag`).bind(...ids).all<{ postId: string; tag: string }>(),
      database().prepare(`SELECT post_id AS postId,display_name AS displayName,kind FROM playground_resources WHERE post_id IN (${placeholders})`).bind(...ids).all<{ postId: string; displayName: string; kind: string }>(),
      database().prepare(`SELECT post.id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,1 AS isAuthor,post.created_at AS firstInteraction,post.created_at AS lastInteraction FROM playground_posts post JOIN members member ON member.id = post.author_id WHERE post.id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
      database().prepare(`SELECT vote.post_id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,0 AS isAuthor,vote.created_at AS firstInteraction,vote.created_at AS lastInteraction FROM playground_post_votes vote JOIN members member ON member.id = vote.member_id WHERE vote.post_id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
      database().prepare(`SELECT bookmark.post_id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,0 AS isAuthor,bookmark.created_at AS firstInteraction,bookmark.created_at AS lastInteraction FROM playground_bookmarks bookmark JOIN members member ON member.id = bookmark.member_id WHERE bookmark.post_id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
      database().prepare(`SELECT comment.post_id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,0 AS isAuthor,comment.created_at AS firstInteraction,comment.created_at AS lastInteraction FROM playground_comments comment JOIN members member ON member.id = comment.author_id WHERE comment.post_id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
      database().prepare(`SELECT comment.post_id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,0 AS isAuthor,vote.created_at AS firstInteraction,vote.created_at AS lastInteraction FROM playground_comment_votes vote JOIN playground_comments comment ON comment.id = vote.comment_id JOIN members member ON member.id = vote.member_id WHERE comment.post_id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
      database().prepare(`SELECT interaction.post_id AS postId,member.id,member.initials,member.avatar_updated_at AS avatarUpdatedAt,member.role,0 AS isAuthor,interaction.first_interacted_at AS firstInteraction,interaction.last_interacted_at AS lastInteraction FROM playground_interactions interaction JOIN members member ON member.id = interaction.member_id WHERE interaction.post_id IN (${placeholders})`).bind(...ids).all<InteractionPreview>(),
    ]);
    for (const row of tags.results) tagsByPost.set(row.postId, [...(tagsByPost.get(row.postId) ?? []), row.tag]);
    for (const row of resources.results) {
      const formatLabel = row.kind === "external" ? "外链" : (resourceExtension(row.displayName).toLocaleUpperCase() || "文件");
      const values = formatsByPost.get(row.postId) ?? [];
      if (!values.includes(formatLabel)) values.push(formatLabel);
      formatsByPost.set(row.postId, values);
    }
    for (const source of [authors, postVotes, bookmarks, commentAuthors, commentVotes, durableInteractions]) {
      for (const row of source.results) {
        const members = interactionMaps.get(row.postId) ?? new Map<string, InteractionPreview>();
        const current = members.get(row.id);
        if (!current) members.set(row.id, row);
        else members.set(row.id, {
          ...current,
          isAuthor: Math.max(current.isAuthor, row.isAuthor),
          firstInteraction: row.firstInteraction < current.firstInteraction ? row.firstInteraction : current.firstInteraction,
          lastInteraction: row.lastInteraction > current.lastInteraction ? row.lastInteraction : current.lastInteraction,
        });
        interactionMaps.set(row.postId, members);
      }
    }
    for (const [postId, members] of interactionMaps) interactionsByPost.set(postId, [...members.values()]
      .sort((left, right) => {
        const priority = (person: InteractionPreview) => person.isAuthor ? 0 : person.role === "superadmin" ? 1 : person.role === "admin" ? 2 : 3;
        return priority(left) - priority(right)
          || left.firstInteraction.localeCompare(right.firstInteraction)
          || left.id.localeCompare(right.id);
      })
      .map(({ id, initials, avatarUpdatedAt }) => ({ id, initials, avatarUpdatedAt })));
  }
  return rows.results.map((row) => ({
    ...row,
    summary: plainSummary(row.body),
    isPinned: Boolean(row.isPinned),
    tags: tagsByPost.get(row.id) ?? [],
    resourceFormats: formatsByPost.get(row.id) ?? [],
    resourceCount: Number(row.resourceCount),
    uploadedBytes: Number(row.uploadedBytes),
    commentCount: Number(row.commentCount),
    upvotes: Number(row.upvotes),
    bookmarkCount: Number(row.bookmarkCount),
    downloadCount: Number(row.downloadCount),
    viewCount: Number(row.viewCount),
    interactionCount: interactionsByPost.get(row.id)?.length ?? 0,
    interactionAvatars: (interactionsByPost.get(row.id) ?? []).slice(0, 8),
    isVoted: Boolean(row.isVoted),
    isBookmarked: Boolean(row.isBookmarked),
  }));
}

type CommentRow = Omit<PlaygroundComment, "reactions" | "isFeatured" | "isHidden" | "isHiddenBranch" | "isVoted" | "canHide" | "canDelete" | "canFeature"> & {
  isFeatured: number;
  isHidden: number;
  isVoted: number;
};

export async function getPlaygroundDetail(postId: string, viewer: SessionMember | null): Promise<PlaygroundDetailData> {
  await ensureDatabase();
  const viewerId = viewer?.id ?? "";
  const post = await database().prepare(`SELECT p.id,p.title,p.body,p.author_id AS authorId,p.is_hidden AS isHidden,p.created_at AS createdAt,p.updated_at AS updatedAt,
      author.display_name AS authorName,author.username AS authorUsername,author.initials AS authorInitials,author.avatar_updated_at AS authorAvatarUpdatedAt,
      (SELECT COUNT(*) FROM playground_post_votes vote WHERE vote.post_id = p.id) AS upvotes,
      (SELECT COUNT(*) FROM playground_bookmarks bookmark WHERE bookmark.post_id = p.id) AS bookmarkCount,
      (SELECT COUNT(*) FROM playground_views visit WHERE visit.post_id = p.id) AS viewCount,
      EXISTS(SELECT 1 FROM playground_post_votes vote WHERE vote.post_id = p.id AND vote.member_id = ?) AS isVoted,
      EXISTS(SELECT 1 FROM playground_bookmarks bookmark WHERE bookmark.post_id = p.id AND bookmark.member_id = ?) AS isBookmarked
    FROM playground_posts p JOIN members author ON author.id = p.author_id WHERE p.id = ?`).bind(viewerId, viewerId, postId).first<{
      id: string; title: string; body: string; authorId: string; isHidden: number; createdAt: string; updatedAt: string;
      authorName: string; authorUsername: string; authorInitials: string; authorAvatarUpdatedAt: string | null;
      upvotes: number; bookmarkCount: number; viewCount: number; isVoted: number; isBookmarked: number;
    }>();
  if (!post) throw new AuthError("内容不存在", 404);
  const siteAdmin = viewer?.role === "admin" || viewer?.role === "superadmin";
  const isAuthor = viewer?.id === post.authorId;
  const canManageContent = viewer ? canActAsContentCreator(viewer, post.authorId) : false;
  if (post.isHidden && !siteAdmin && !isAuthor) throw new AuthError("内容不存在", 404);
  const [tagRows, resourceRows, commentRows, reactionRows] = await Promise.all([
    database().prepare("SELECT tag FROM playground_tags WHERE post_id = ? ORDER BY tag").bind(postId).all<{ tag: string }>(),
    database().prepare(`SELECT id,kind,display_name AS displayName,description,mime_type AS mimeType,byte_size AS byteSize,sha256,
      download_count AS downloadCount,external_url AS externalUrl,created_at AS createdAt
      FROM playground_resources WHERE post_id = ? ORDER BY created_at,id`).bind(postId).all<PlaygroundResource>(),
    database().prepare(`SELECT comment.id,comment.post_id AS postId,comment.parent_id AS parentId,comment.body,comment.is_featured AS isFeatured,comment.is_hidden AS isHidden,
      comment.upvotes,comment.created_at AS createdAt,comment.updated_at AS updatedAt,comment.author_id AS authorId,
      author.display_name AS authorName,author.username AS authorUsername,author.initials AS authorInitials,author.avatar_updated_at AS authorAvatarUpdatedAt,
      EXISTS(SELECT 1 FROM playground_comment_votes vote WHERE vote.comment_id = comment.id AND vote.member_id = ?) AS isVoted
      FROM playground_comments comment JOIN members author ON author.id = comment.author_id
      WHERE comment.post_id = ? ORDER BY comment.created_at`).bind(viewerId, postId).all<CommentRow>(),
    database().prepare(`SELECT reaction.comment_id AS commentId,reaction.emoji,COUNT(*) AS count,
      MAX(CASE WHEN reaction.member_id = ? THEN 1 ELSE 0 END) AS reactedByViewer
      FROM playground_comment_reactions reaction
      JOIN playground_comments comment ON comment.id = reaction.comment_id
      WHERE comment.post_id = ?
      GROUP BY reaction.comment_id,reaction.emoji`).bind(viewerId, postId).all<{ commentId: string; emoji: string; count: number; reactedByViewer: number }>(),
  ]);
  const reactionOrder = new Map(PLAYGROUND_COMMENT_MARKERS.map((option, index) => [option.emoji, index]));
  const reactionsByComment = new Map<string, PlaygroundCommentReaction[]>();
  for (const reaction of reactionRows.results) {
    if (!isPlaygroundCommentMarker(reaction.emoji)) continue;
    const items = reactionsByComment.get(reaction.commentId) ?? [];
    items.push({ emoji: reaction.emoji, count: Number(reaction.count), reactedByViewer: Boolean(reaction.reactedByViewer) });
    reactionsByComment.set(reaction.commentId, items);
  }
  for (const items of reactionsByComment.values()) items.sort((left, right) => (reactionOrder.get(left.emoji) ?? 999) - (reactionOrder.get(right.emoji) ?? 999));
  const byId = new Map(commentRows.results.map((comment) => [comment.id, comment]));
  function hiddenRoot(comment: CommentRow) {
    let current: CommentRow | undefined = comment;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.isHidden) return current;
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  }
  const canModerateComments = Boolean(siteAdmin || isAuthor);
  const comments = commentRows.results.flatMap((comment): PlaygroundComment[] => {
    const root = hiddenRoot(comment);
    if (root && !canModerateComments && root.authorId !== viewer?.id) return [];
    return [{
      ...comment,
      reactions: reactionsByComment.get(comment.id) ?? [],
      isFeatured: Boolean(comment.isFeatured),
      isHidden: Boolean(comment.isHidden),
      isHiddenBranch: Boolean(root),
      isVoted: Boolean(comment.isVoted),
      canHide: comment.authorId === viewer?.id,
      canDelete: canModerateComments,
      canFeature: canModerateComments,
      upvotes: Number(comment.upvotes),
    }];
  });
  return {
    post: {
      ...post,
      tags: tagRows.results.map((row) => row.tag),
      upvotes: Number(post.upvotes),
      bookmarkCount: Number(post.bookmarkCount),
      viewCount: Number(post.viewCount),
      isVoted: Boolean(post.isVoted),
      isBookmarked: Boolean(post.isBookmarked),
    },
    resources: resourceRows.results.map((resource) => ({ ...resource, byteSize: resource.byteSize === null ? null : Number(resource.byteSize), downloadCount: Number(resource.downloadCount) })),
    comments,
    viewer: viewer ? { id: viewer.id, role: viewer.role, initials: viewer.initials, avatarUpdatedAt: viewer.avatarUpdatedAt, isAuthor: Boolean(isAuthor), canEdit: canManageContent, canDelete: canManageContent, canModerateComments } : null,
  };
}

async function existingPost(postId: string) {
  const post = await database().prepare("SELECT id,author_id AS authorId,is_hidden AS isHidden FROM playground_posts WHERE id = ?")
    .bind(postId).first<{ id: string; authorId: string; isHidden: number }>();
  if (!post) throw new AuthError("内容不存在", 404);
  return post;
}

async function recordPlaygroundInteraction(postId: string, memberId: string, interactedAt = new Date().toISOString()) {
  await database().prepare(`INSERT INTO playground_interactions (post_id,member_id,first_interacted_at,last_interacted_at) VALUES (?,?,?,?)
    ON CONFLICT(post_id,member_id) DO UPDATE SET last_interacted_at = excluded.last_interacted_at`)
    .bind(postId, memberId, interactedAt, interactedAt).run();
}

async function notifyPlayground(postId: string, actorId: string, recipientIds: string[], kind: string, summary: string) {
  const audience = [...new Set(recipientIds)].filter((memberId) => memberId && memberId !== actorId);
  if (!audience.length) return;
  const db = database();
  const createdAt = new Date().toISOString();
  await db.batch(audience.map((memberId) => db.prepare(`INSERT INTO playground_notifications
    (id,member_id,post_id,kind,summary,created_at,read_at) VALUES (?,?,?,?,?,?,NULL)`)
    .bind(`playground-notification-${crypto.randomUUID()}`, memberId, postId, kind, summary, createdAt)));
}

async function playgroundAudience(postId: string) {
  const rows = await database().prepare(`SELECT author_id AS memberId FROM playground_posts WHERE id = ?
    UNION SELECT member_id AS memberId FROM playground_interactions WHERE post_id = ?`)
    .bind(postId, postId).all<{ memberId: string }>();
  return rows.results.map((row) => row.memberId);
}

export async function recordPlaygroundMemberInteraction(postId: string, member: SessionMember) {
  await ensureDatabase();
  await existingPost(postId);
  await recordPlaygroundInteraction(postId, member.id);
  return { recorded: true };
}

async function playgroundViewerKey(request: Request, member: SessionMember | null) {
  if (member) return `member:${member.id}`;
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
  const fingerprint = `${forwarded}|${request.headers.get("user-agent") ?? "unknown"}|${request.headers.get("accept-language") ?? ""}`;
  return `anonymous:${hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint))).slice(0, 32)}`;
}

export async function recordPlaygroundView(postId: string, request: Request, member: SessionMember | null) {
  await ensureDatabase();
  const now = new Date();
  const windowStartedAt = playgroundViewWindowStart(now.getTime());
  const viewerKey = await playgroundViewerKey(request, member);
  const result = await database().prepare(`INSERT OR IGNORE INTO playground_views (post_id,viewer_key,window_started_at,created_at)
    SELECT id,?,?,? FROM playground_posts WHERE id = ?`)
    .bind(viewerKey, windowStartedAt, now.toISOString(), postId).run();
  return { recorded: Number(result.meta.changes ?? 0) > 0 };
}

export async function togglePlaygroundPostVote(postId: string, member: SessionMember) {
  await ensureDatabase();
  const post = await existingPost(postId);
  const vote = await database().prepare("SELECT post_id FROM playground_post_votes WHERE post_id = ? AND member_id = ?")
    .bind(postId, member.id).first<{ post_id: string }>();
  if (vote) await database().prepare("DELETE FROM playground_post_votes WHERE post_id = ? AND member_id = ?").bind(postId, member.id).run();
  else await database().prepare("INSERT INTO playground_post_votes (post_id,member_id,created_at) VALUES (?,?,?)").bind(postId, member.id, new Date().toISOString()).run();
  await recordPlaygroundInteraction(postId, member.id);
  if (!vote) await notifyPlayground(postId, member.id, [post.authorId], "post_vote", `${member.displayName}顶了你的内容`);
  const count = await database().prepare("SELECT COUNT(*) AS count FROM playground_post_votes WHERE post_id = ?").bind(postId).first<{ count: number }>();
  return { active: !vote, count: Number(count?.count ?? 0) };
}

export async function togglePlaygroundBookmark(postId: string, member: SessionMember) {
  await ensureDatabase();
  const post = await existingPost(postId);
  const bookmark = await database().prepare("SELECT post_id FROM playground_bookmarks WHERE post_id = ? AND member_id = ?")
    .bind(postId, member.id).first<{ post_id: string }>();
  if (bookmark) await database().prepare("DELETE FROM playground_bookmarks WHERE post_id = ? AND member_id = ?").bind(postId, member.id).run();
  else await database().prepare("INSERT INTO playground_bookmarks (post_id,member_id,created_at) VALUES (?,?,?)").bind(postId, member.id, new Date().toISOString()).run();
  await recordPlaygroundInteraction(postId, member.id);
  if (!bookmark) await notifyPlayground(postId, member.id, [post.authorId], "bookmark", `${member.displayName}收藏了你的内容`);
  const count = await database().prepare("SELECT COUNT(*) AS count FROM playground_bookmarks WHERE post_id = ?").bind(postId).first<{ count: number }>();
  return { active: !bookmark, count: Number(count?.count ?? 0) };
}

export async function createPlaygroundComment(postId: string, member: SessionMember, bodyValue: unknown, parentValue: unknown) {
  await ensureDatabase();
  await existingPost(postId);
  const body = textValue(bodyValue, "评论", 20_000);
  const parentId = asString(parentValue, 100) || null;
  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = await database().prepare("SELECT id,author_id AS authorId FROM playground_comments WHERE id = ? AND post_id = ?").bind(parentId, postId).first<{ id: string; authorId: string }>();
    if (!parent) throw new AuthError("回复的评论不存在", 404);
    parentAuthorId = parent.authorId;
  }
  const id = `playground-comment-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  await database().prepare(`INSERT INTO playground_comments
    (id,post_id,parent_id,author_id,body,is_hidden,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,0,0,?,?)`)
    .bind(id, postId, parentId, member.id, body, createdAt, createdAt).run();
  await database().prepare("UPDATE playground_posts SET updated_at = ? WHERE id = ?").bind(createdAt, postId).run();
  await recordPlaygroundInteraction(postId, member.id, createdAt);
  await notifyPlayground(postId, member.id, [...await playgroundAudience(postId), ...(parentAuthorId ? [parentAuthorId] : [])], parentId ? "reply" : "comment", `${member.displayName}${parentId ? "回复了评论" : "发表了新评论"}`);
  return { id };
}

export async function togglePlaygroundCommentVote(postId: string, commentId: string, member: SessionMember) {
  await ensureDatabase();
  const comment = await database().prepare("SELECT id,author_id AS authorId FROM playground_comments WHERE id = ? AND post_id = ?").bind(commentId, postId).first<{ id: string; authorId: string }>();
  if (!comment) throw new AuthError("评论不存在", 404);
  const vote = await database().prepare("SELECT comment_id FROM playground_comment_votes WHERE comment_id = ? AND member_id = ?")
    .bind(commentId, member.id).first<{ comment_id: string }>();
  const delta = vote ? -1 : 1;
  await database().batch([
    vote
      ? database().prepare("DELETE FROM playground_comment_votes WHERE comment_id = ? AND member_id = ?").bind(commentId, member.id)
      : database().prepare("INSERT INTO playground_comment_votes (comment_id,member_id,created_at) VALUES (?,?,?)").bind(commentId, member.id, new Date().toISOString()),
    database().prepare("UPDATE playground_comments SET upvotes = MAX(0,upvotes + ?) WHERE id = ?").bind(delta, commentId),
  ]);
  await recordPlaygroundInteraction(postId, member.id);
  if (!vote) await notifyPlayground(postId, member.id, [comment.authorId], "comment_vote", `${member.displayName}顶了你的评论`);
  const row = await database().prepare("SELECT upvotes FROM playground_comments WHERE id = ?").bind(commentId).first<{ upvotes: number }>();
  return { active: !vote, count: Number(row?.upvotes ?? 0) };
}

export async function togglePlaygroundCommentReaction(postId: string, commentId: string, markerValue: unknown, member: SessionMember) {
  await ensureDatabase();
  const marker = asString(markerValue, 8);
  if (!isPlaygroundCommentMarker(marker)) throw new AuthError("表情标记无效");
  const comment = await database().prepare("SELECT id FROM playground_comments WHERE id = ? AND post_id = ?")
    .bind(commentId, postId).first<{ id: string }>();
  if (!comment) throw new AuthError("评论不存在", 404);
  const existing = await database().prepare("SELECT comment_id FROM playground_comment_reactions WHERE comment_id = ? AND member_id = ? AND emoji = ?")
    .bind(commentId, member.id, marker).first<{ comment_id: string }>();
  if (existing) {
    await database().prepare("DELETE FROM playground_comment_reactions WHERE comment_id = ? AND member_id = ? AND emoji = ?")
      .bind(commentId, member.id, marker).run();
  } else {
    await database().prepare("INSERT INTO playground_comment_reactions (comment_id,member_id,emoji,created_at) VALUES (?,?,?,?)")
      .bind(commentId, member.id, marker, new Date().toISOString()).run();
  }
  await recordPlaygroundInteraction(postId, member.id);
  const count = await database().prepare("SELECT COUNT(*) AS count FROM playground_comment_reactions WHERE comment_id = ? AND emoji = ?")
    .bind(commentId, marker).first<{ count: number }>();
  return { emoji: marker, active: !existing, count: Number(count?.count ?? 0) };
}

export async function togglePlaygroundCommentFeatured(postId: string, commentId: string, member: SessionMember) {
  await ensureDatabase();
  const post = await existingPost(postId);
  const canFeature = post.authorId === member.id || member.role === "admin" || member.role === "superadmin";
  if (!canFeature) throw new AuthError("只有发布者或管理员可以设置精选", 403);
  const comment = await database().prepare("SELECT id,author_id AS authorId,is_featured AS isFeatured FROM playground_comments WHERE id = ? AND post_id = ?")
    .bind(commentId, postId).first<{ id: string; authorId: string; isFeatured: number }>();
  if (!comment) throw new AuthError("评论不存在", 404);
  const featured = !comment.isFeatured;
  await database().prepare("UPDATE playground_comments SET is_featured = ?, updated_at = ? WHERE id = ?")
    .bind(featured ? 1 : 0, new Date().toISOString(), commentId).run();
  await recordPlaygroundInteraction(postId, member.id);
  if (featured) await notifyPlayground(postId, member.id, [comment.authorId], "featured", `${member.displayName}将你的评论设为精选`);
  return { featured };
}

export async function setPlaygroundCommentHidden(postId: string, commentId: string, member: SessionMember, hidden: boolean) {
  await ensureDatabase();
  const comment = await database().prepare("SELECT id,author_id AS authorId FROM playground_comments WHERE id = ? AND post_id = ?")
    .bind(commentId, postId).first<{ id: string; authorId: string }>();
  if (!comment) throw new AuthError("评论不存在", 404);
  if (comment.authorId !== member.id) throw new AuthError("只能隐藏自己的评论", 403);
  await database().prepare("UPDATE playground_comments SET is_hidden = ?, updated_at = ? WHERE id = ?")
    .bind(hidden ? 1 : 0, new Date().toISOString(), commentId).run();
  await recordPlaygroundInteraction(postId, member.id);
  return { hidden };
}

export async function deletePlaygroundCommentBranch(postId: string, commentId: string, member: SessionMember) {
  await ensureDatabase();
  const post = await existingPost(postId);
  const siteAdmin = member.role === "admin" || member.role === "superadmin";
  if (!siteAdmin && post.authorId !== member.id) throw new AuthError("没有删除评论的权限", 403);
  const comment = await database().prepare("SELECT id FROM playground_comments WHERE id = ? AND post_id = ?").bind(commentId, postId).first<{ id: string }>();
  if (!comment) throw new AuthError("评论不存在", 404);
  await recordPlaygroundInteraction(postId, member.id);
  await database().prepare(`WITH RECURSIVE branch(id) AS (
      SELECT id FROM playground_comments WHERE id = ? AND post_id = ?
      UNION ALL
      SELECT child.id FROM playground_comments child JOIN branch parent ON child.parent_id = parent.id
      WHERE child.post_id = ?
    )
    DELETE FROM playground_comments WHERE id IN (SELECT id FROM branch)`).bind(commentId, postId, postId).run();
  return { deleted: true };
}

export async function playgroundResourceKeysForPost(postId: string) {
  const rows = await database().prepare("SELECT storage_key AS storageKey FROM playground_resources WHERE post_id = ? AND storage_key IS NOT NULL")
    .bind(postId).all<{ storageKey: string }>();
  return rows.results.map((row) => row.storageKey);
}

export async function deletePlaygroundPost(postId: string, member: SessionMember) {
  await ensureDatabase();
  const post = await existingPost(postId);
  if (!canActAsContentCreator(member, post.authorId)) throw new AuthError("只有创建者或超级管理员可以删除内容", 403);
  const keys = await playgroundResourceKeysForPost(postId);
  await database().prepare("DELETE FROM playground_posts WHERE id = ?").bind(postId).run();
  await deletePlaygroundObjects(keys);
  return { deleted: true };
}

export async function searchPlaygroundTransferCandidates(postId: string, member: SessionMember, queryValue: unknown) {
  await ensureDatabase();
  const post = await existingPost(postId);
  if (!canActAsContentCreator(member, post.authorId)) throw new AuthError("只有创建者或超级管理员可以转让内容", 403);
  return searchActiveTransferCandidates(post.authorId, queryValue);
}

export async function transferPlaygroundPost(postId: string, member: SessionMember, targetMemberIdValue: unknown) {
  await ensureDatabase();
  const post = await existingPost(postId);
  if (!canActAsContentCreator(member, post.authorId)) throw new AuthError("只有创建者或超级管理员可以转让内容", 403);
  const target = await requireActiveTransferTarget(post.authorId, targetMemberIdValue);
  const changedAt = new Date().toISOString();
  await database().batch([
    database().prepare("UPDATE playground_posts SET author_id = ?, updated_at = ? WHERE id = ? AND author_id = ?")
      .bind(target.id, changedAt, postId, post.authorId),
    database().prepare(`INSERT INTO playground_interactions (post_id,member_id,first_interacted_at,last_interacted_at) VALUES (?,?,?,?)
      ON CONFLICT(post_id,member_id) DO UPDATE SET last_interacted_at = excluded.last_interacted_at`)
      .bind(postId, target.id, changedAt, changedAt),
  ]);
  await notifyPlayground(postId, member.id, [target.id], "ownership_transfer", `${member.displayName}将内容转让给了你`);
  return { transferred: true };
}

function encodedFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function downloadPlaygroundResource(resourceId: string, viewer: SessionMember | null) {
  await ensureDatabase();
  const resource = await database().prepare(`SELECT resource.id,resource.kind,resource.display_name AS displayName,resource.storage_key AS storageKey,
      resource.mime_type AS mimeType,resource.byte_size AS byteSize,post.id AS postId,post.author_id AS authorId,post.is_hidden AS postHidden
    FROM playground_resources resource JOIN playground_posts post ON post.id = resource.post_id WHERE resource.id = ?`)
    .bind(resourceId).first<{ id: string; kind: string; displayName: string; storageKey: string | null; mimeType: string | null; byteSize: number | null; postId: string; authorId: string; postHidden: number }>();
  if (!resource || resource.kind !== "upload" || !resource.storageKey) throw new AuthError("文件不存在", 404);
  const siteAdmin = viewer?.role === "admin" || viewer?.role === "superadmin";
  if (resource.postHidden && !siteAdmin && resource.authorId !== viewer?.id) throw new AuthError("文件不存在", 404);
  const object = await mediaBucket().get(resource.storageKey);
  if (!object) throw new AuthError("文件不存在", 404);
  await database().prepare("UPDATE playground_resources SET download_count = download_count + 1 WHERE id = ?").bind(resourceId).run();
  if (viewer) await recordPlaygroundInteraction(resource.postId, viewer.id);
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodedFilename(resource.displayName)}`,
      "Content-Length": String(object.size),
      "Content-Type": resource.mimeType || "application/octet-stream",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function parsePlaygroundForm(form: FormData) {
  let tags: unknown = [];
  let externalResources: unknown = [];
  let keepResourceIds: unknown = [];
  let fileDescriptions: unknown = [];
  try { tags = JSON.parse(String(form.get("tags") ?? "[]")); } catch { throw new AuthError("标签格式无效"); }
  try { externalResources = JSON.parse(String(form.get("externalResources") ?? "[]")); } catch { throw new AuthError("外部资源格式无效"); }
  try { keepResourceIds = JSON.parse(String(form.get("keepResourceIds") ?? "[]")); } catch { throw new AuthError("保留资源格式无效"); }
  try { fileDescriptions = JSON.parse(String(form.get("fileDescriptions") ?? "[]")); } catch { throw new AuthError("文件说明格式无效"); }
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  const descriptions = Array.isArray(fileDescriptions) ? fileDescriptions : [];
  const uploads = files.map((file, index) => ({ file, description: asString(descriptions[index], MAX_PLAYGROUND_RESOURCE_DESCRIPTION) }));
  return {
    payload: { title: form.get("title"), body: form.get("body"), tags, externalResources, keepResourceIds },
    uploads,
  };
}

export function parseJsonArray(value: string | null | undefined) {
  return jsonArray(value);
}
