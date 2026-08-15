import {
  attachmentMarkerPattern,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_ATTACHMENT_TITLE,
  utf8Size,
  type DraftMessageAttachment,
} from "../app/lib/message-attachments";
import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { mediaBucket } from "./media";
import { database } from "./runtime";

type StoredAttachment = {
  id: string;
  messageId: string;
  title: string;
  storageKey: string;
  byteSize: number;
  createdAt: string;
};

function markdownLinkTitle(title: string) {
  return title.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function normalizedIncomingAttachments(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new AuthError("附件格式无效");
  if (value.length > MAX_MESSAGE_ATTACHMENTS) throw new AuthError(`每条讨论最多携带 ${MAX_MESSAGE_ATTACHMENTS} 个附件`);

  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new AuthError("附件格式无效");
    const candidate = item as Record<string, unknown>;
    const draftId = typeof candidate.draftId === "string" ? candidate.draftId.toLocaleLowerCase() : "";
    const title = typeof candidate.title === "string" ? candidate.title.replace(/\s+/g, " ").trim() : "";
    const content = typeof candidate.content === "string" ? candidate.content.replace(/\r\n?/g, "\n") : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId) || seen.has(draftId)) {
      throw new AuthError("附件编号无效");
    }
    if (!title || title.length > MAX_MESSAGE_ATTACHMENT_TITLE) throw new AuthError(`附件标题不能超过 ${MAX_MESSAGE_ATTACHMENT_TITLE} 个字符`);
    const byteSize = utf8Size(content);
    if (!content.trim()) throw new AuthError("附件内容不能为空");
    if (byteSize > MAX_MESSAGE_ATTACHMENT_BYTES) throw new AuthError("每个附件不能超过 1 MiB");
    seen.add(draftId);
    return { draftId, title, content, byteSize };
  });
}

export async function stageMessageAttachments(messageId: string, bodyValue: unknown, attachmentsValue: unknown, createdAt: string) {
  const sourceBody = typeof bodyValue === "string" ? bodyValue.replace(/\r\n?/g, "\n").trim() : "";
  if (sourceBody.length > 20_000) throw new AuthError("消息正文不能超过 20000 个字符");
  const attachments = normalizedIncomingAttachments(attachmentsValue);
  const markers = Array.from(sourceBody.matchAll(attachmentMarkerPattern()), (match) => match[1].toLocaleLowerCase());
  if (!sourceBody || (!sourceBody.replace(attachmentMarkerPattern(), "").trim() && !attachments.length)) throw new AuthError("消息不能为空");
  if (markers.length !== attachments.length || new Set(markers).size !== markers.length) throw new AuthError("附件在正文中的位置无效");
  const byDraftId = new Map(attachments.map((attachment) => [attachment.draftId, attachment]));
  if (markers.some((draftId) => !byDraftId.has(draftId)) || attachments.some((attachment) => !markers.includes(attachment.draftId))) {
    throw new AuthError("附件与正文不匹配");
  }

  const storedByDraftId = new Map<string, StoredAttachment>();
  for (const attachment of attachments) {
    const id = `attachment-${crypto.randomUUID()}`;
    storedByDraftId.set(attachment.draftId, {
      id,
      messageId,
      title: attachment.title,
      storageKey: `attachments/${messageId}/${id}.md`,
      byteSize: attachment.byteSize,
      createdAt,
    });
  }

  const uploadedKeys: string[] = [];
  try {
    for (const attachment of attachments) {
      const stored = storedByDraftId.get(attachment.draftId)!;
      const bytes = new TextEncoder().encode(attachment.content);
      await mediaBucket().put(stored.storageKey, bytes.buffer as ArrayBuffer, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8", cacheControl: "private, no-store" },
        customMetadata: { attachmentId: stored.id, messageId },
      });
      uploadedKeys.push(stored.storageKey);
    }
  } catch (error) {
    await deleteAttachmentObjects(uploadedKeys);
    throw error;
  }

  const body = sourceBody.replace(attachmentMarkerPattern(), (_marker, draftId: string) => {
    const stored = storedByDraftId.get(draftId.toLocaleLowerCase());
    if (!stored) throw new AuthError("附件与正文不匹配");
    return `[${markdownLinkTitle(stored.title)}](/api/attachments/${encodeURIComponent(stored.id)})`;
  });
  return { body, records: Array.from(storedByDraftId.values()), uploadedKeys };
}

export async function deleteAttachmentObjects(keys: string[]) {
  if (!keys.length) return;
  try {
    const bucket = mediaBucket();
    await Promise.allSettled(keys.map((key) => bucket.delete(key)));
  } catch {
    // Database deletion remains authoritative if media storage is temporarily unavailable.
  }
}

export async function attachmentKeysForMessageBranch(problemId: string, messageId: string) {
  const rows = await database().prepare(`WITH RECURSIVE descendants(id) AS (
      SELECT id FROM messages WHERE id = ? AND problem_id = ?
      UNION ALL
      SELECT child.id FROM messages child JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.problem_id = ?
    )
    SELECT attachment.storage_key AS storageKey FROM message_attachments attachment
    WHERE attachment.message_id IN (SELECT id FROM descendants)`)
    .bind(messageId, problemId, problemId).all<{ storageKey: string }>();
  return rows.results.map((row) => row.storageKey);
}

export async function attachmentKeysForProblem(problemId: string) {
  const rows = await database().prepare(`SELECT attachment.storage_key AS storageKey
    FROM message_attachments attachment JOIN messages message ON message.id = attachment.message_id
    WHERE message.problem_id = ?`).bind(problemId).all<{ storageKey: string }>();
  return rows.results.map((row) => row.storageKey);
}

export async function attachmentKeysForMemberDeletion(memberId: string) {
  const rows = await database().prepare(`WITH RECURSIVE removed_messages(id) AS (
      SELECT message.id FROM messages message
      WHERE message.author_id = ? OR message.problem_id IN (SELECT problem.id FROM problems problem WHERE problem.creator_id = ?)
      UNION
      SELECT child.id FROM messages child JOIN removed_messages parent ON child.parent_id = parent.id
    )
    SELECT DISTINCT attachment.storage_key AS storageKey FROM message_attachments attachment
    WHERE attachment.message_id IN (SELECT id FROM removed_messages)`)
    .bind(memberId, memberId).all<{ storageKey: string }>();
  return rows.results.map((row) => row.storageKey);
}

function encodedFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function downloadMessageAttachment(attachmentId: string, viewer: SessionMember) {
  const record = await database().prepare(`WITH RECURSIVE ancestry(id,parent_id,author_id,is_hidden,depth) AS (
      SELECT message.id,message.parent_id,message.author_id,message.is_hidden,0
      FROM messages message JOIN message_attachments attachment ON attachment.message_id = message.id
      WHERE attachment.id = ?
      UNION ALL
      SELECT parent.id,parent.parent_id,parent.author_id,parent.is_hidden,child.depth + 1
      FROM messages parent JOIN ancestry child ON parent.id = child.parent_id
    )
    SELECT attachment.id,attachment.title,attachment.storage_key AS storageKey,attachment.byte_size AS byteSize,
      message.problem_id AS problemId,problem.creator_id AS creatorId,problem.is_hidden AS problemHidden,
      COALESCE(membership.is_manager,0) AS viewerIsManager,
      (SELECT author_id FROM ancestry WHERE is_hidden = 1 ORDER BY depth DESC LIMIT 1) AS hiddenRootAuthorId
    FROM message_attachments attachment
    JOIN messages message ON message.id = attachment.message_id
    JOIN problems problem ON problem.id = message.problem_id
    LEFT JOIN problem_members membership ON membership.problem_id = problem.id AND membership.member_id = ?
    WHERE attachment.id = ?`)
    .bind(attachmentId, viewer.id, attachmentId).first<{
      id: string; title: string; storageKey: string; byteSize: number; problemId: string; creatorId: string;
      problemHidden: number; viewerIsManager: number; hiddenRootAuthorId: string | null;
    }>();
  if (!record) throw new AuthError("附件不存在", 404);
  const siteAdmin = viewer.role === "admin" || viewer.role === "superadmin";
  const moderator = siteAdmin || record.creatorId === viewer.id || Boolean(record.viewerIsManager);
  if ((record.problemHidden && !siteAdmin) || (record.hiddenRootAuthorId && !moderator && record.hiddenRootAuthorId !== viewer.id)) {
    throw new AuthError("附件不存在", 404);
  }
  const object = await mediaBucket().get(record.storageKey);
  if (!object) throw new AuthError("附件文件不存在", 404);
  const filename = record.title.toLocaleLowerCase().endsWith(".md") ? record.title : `${record.title}.md`;
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="attachment.md"; filename*=UTF-8''${encodedFilename(filename)}`,
      "Content-Length": String(object.size),
      "Content-Type": "text/markdown; charset=utf-8",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export type { DraftMessageAttachment };
