import type { SessionMember } from "./auth";
import { AuthError } from "./auth";
import { asString, database, ensureDatabase, jsonArray } from "./runtime";

type ProblemRow = {
  id: string;
  shortCode: string;
  title: string;
  body: string;
  background: string;
  status: string;
  isPinned: number;
  creatorId: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  tags: string;
  participantCount: number;
  participantAvatars: string | null;
  viewerRelation: string | null;
};

type ParticipantPreview = { id: string; initials: string; avatarUpdatedAt: string | null };

function splitList(value: string | null | undefined) {
  return value ? value.split("|").filter(Boolean) : [];
}

function participantPreviews(value: string | null | undefined): ParticipantPreview[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== "string" || typeof candidate.initials !== "string") return [];
      return [{
        id: candidate.id,
        initials: candidate.initials,
        avatarUpdatedAt: typeof candidate.avatarUpdatedAt === "string" ? candidate.avatarUpdatedAt : null,
      }];
    });
  } catch {
    return [];
  }
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().replace(/\s+/g, " ").slice(0, 24))
    .filter(Boolean))].slice(0, 8);
}

function markdownSummary(source: string) {
  const withoutDisplayMath = source.replace(/\$\$[\s\S]*?\$\$/g, " ");
  const paragraph = withoutDisplayMath
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean)
    ?.replace(/\s*\n\s*/g, " ") ?? "";
  if (paragraph.length <= 600) return paragraph;

  let end = 600;
  const dollarsBeforeEnd = (paragraph.slice(0, end).match(/(?<!\\)\$/g) ?? []).length;
  if (dollarsBeforeEnd % 2 === 1) {
    const closingDollar = paragraph.slice(end).search(/(?<!\\)\$/);
    if (closingDollar >= 0) end += closingDollar + 1;
  }
  return `${paragraph.slice(0, end).trim()}…`;
}

export async function listProblems(input: {
  query?: string;
  tags?: string[];
  statuses?: string[];
  relations?: string[];
  updatedWithin?: string[];
  viewerId?: string | null;
  viewerRole?: string | null;
}) {
  await ensureDatabase();
  const viewerId = input.viewerId ?? "";
  const result = await database()
    .prepare(`SELECT
      p.id,
      p.short_code AS shortCode,
      p.title,
      p.body,
      p.background,
      p.status,
      p.creator_id AS creatorId,
      p.is_hidden AS isHidden,
      p.is_pinned AS isPinned,
      creator.display_name AS creatorName,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt,
      COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM problem_tags WHERE problem_id = p.id), '') AS tags,
      (SELECT COUNT(*) FROM problem_members pm WHERE pm.problem_id = p.id AND pm.relation = 'participating') AS participantCount,
      (SELECT json_group_array(json_object(
        'id', preview.id,
        'initials', preview.initials,
        'avatarUpdatedAt', preview.avatarUpdatedAt
      )) FROM (
        SELECT member.id, member.initials, member.avatar_updated_at AS avatarUpdatedAt
        FROM problem_members visible
        JOIN members member ON member.id = visible.member_id
        WHERE visible.problem_id = p.id AND visible.relation = 'participating'
        ORDER BY visible.joined_at ASC
        LIMIT 4
      ) preview) AS participantAvatars,
      (SELECT relation FROM problem_members mine WHERE mine.problem_id = p.id AND mine.member_id = ?) AS viewerRelation
    FROM problems p
    JOIN members creator ON creator.id = p.creator_id
    WHERE p.is_hidden = 0 OR ? IN ('admin', 'superadmin')
    ORDER BY p.is_pinned DESC, p.updated_at DESC
    LIMIT 100`)
    .bind(viewerId, input.viewerRole ?? "member")
    .all<ProblemRow>();

  const query = (input.query ?? "").trim().toLocaleLowerCase();
  const tagFilters = input.tags ?? [];
  const statusFilters = input.statuses ?? [];
  const relationFilters = input.relations ?? [];
  const updatedFilters = input.updatedWithin ?? [];
  const now = Date.now();

  return result.results
    .map((row) => {
      const participantAvatars = participantPreviews(row.participantAvatars);
      return {
        ...row,
        tags: splitList(row.tags),
        participantAvatars,
        participantInitials: participantAvatars.map((person) => person.initials),
        participantCount: Number(row.participantCount),
        isPinned: Boolean(row.isPinned),
        viewerRelation: row.viewerRelation ?? "watching",
        summary: markdownSummary(row.body),
      };
    })
    .filter((problem) => {
      if (query && ![problem.title, problem.body, problem.background, ...problem.tags]
        .some((value) => value.toLocaleLowerCase().includes(query))) return false;
      if (tagFilters.length && !tagFilters.some((tag) => problem.tags.includes(tag))) return false;
      if (statusFilters.length && !statusFilters.includes(problem.status)) return false;
      if (relationFilters.length && !relationFilters.includes(problem.viewerRelation)) return false;
      if (updatedFilters.length) {
        const ageDays = (now - new Date(problem.updatedAt).getTime()) / 86_400_000;
        const matches = updatedFilters.some((value) => value === "1d" ? ageDays <= 1 : value === "7d" ? ageDays <= 7 : value === "30d" ? ageDays <= 30 : true);
        if (!matches) return false;
      }
      return true;
    });
}

export async function listTags() {
  await ensureDatabase();
  const result = await database()
    .prepare(`SELECT pt.tag, COUNT(*) AS uses
      FROM problem_tags pt JOIN problems p ON p.id = pt.problem_id
      WHERE p.is_hidden = 0
      GROUP BY pt.tag ORDER BY uses DESC, pt.tag ASC LIMIT 100`)
    .all<{ tag: string; uses: number }>();
  return result.results.map((item) => item.tag);
}

async function nextShortCode() {
  const row = await database()
    .prepare("SELECT MAX(CAST(SUBSTR(short_code, 3) AS INTEGER)) AS maximum FROM problems")
    .first<{ maximum: number | null }>();
  return `P-${String(Number(row?.maximum ?? 0) + 1).padStart(4, "0")}`;
}

export async function createProblem(member: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  const title = asString(payload.title, 140);
  const body = asString(payload.body, 30_000);
  const background = asString(payload.background, 20_000);
  const tags = cleanTags(payload.tags);
  if (!title || !body || !tags.length) throw new AuthError("请填写标题、正文并至少添加一个标签");
  const id = `problem-${crypto.randomUUID()}`;
  const shortCode = await nextShortCode();
  const now = new Date().toISOString();
  const db = database();
  await db.batch([
    db.prepare("INSERT INTO problems (id,short_code,title,body,background,status,creator_id,created_at,updated_at) VALUES (?,?,?,?,?,'开放',?,?,?)")
      .bind(id, shortCode, title, body, background, member.id, now, now),
    db.prepare("INSERT INTO problem_members (problem_id,member_id,relation,is_manager,joined_at) VALUES (?,?,'participating',0,?)")
      .bind(id, member.id, now),
    ...tags.map((tag) => db.prepare("INSERT INTO problem_tags (problem_id,tag) VALUES (?,?)").bind(id, tag)),
  ]);
  return { id, shortCode };
}

type PersonRow = {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUpdatedAt: string | null;
  specialties: string;
  relation: "participating" | "following";
  isManager: number;
  joinedAt: string;
  isAdopted: number;
};

type MessageRow = {
  id: string;
  problemId: string;
  parentId: string | null;
  body: string;
  kind: "解法" | "见解" | "反例" | null;
  isHidden: number;
  isAdopted: number;
  upvotes: number;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorInitials: string;
  authorAvatarUpdatedAt: string | null;
  isVoted: number;
};

export async function getProblemDetail(problemId: string, viewer: SessionMember) {
  await ensureDatabase();
  const db = database();
  const problem = await db
    .prepare(`SELECT
      p.id,
      p.short_code AS shortCode,
      p.title,
      p.body,
      p.background,
      p.status,
      p.creator_id AS creatorId,
      creator.display_name AS creatorName,
      creator.username AS creatorUsername,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt,
      COALESCE((SELECT GROUP_CONCAT(tag, '|') FROM problem_tags WHERE problem_id = p.id), '') AS tags
    FROM problems p
    JOIN members creator ON creator.id = p.creator_id
    WHERE p.id = ? AND (p.is_hidden = 0 OR ? IN ('admin', 'superadmin'))`)
    .bind(problemId, viewer.role)
    .first<ProblemRow & { creatorUsername: string }>();
  if (!problem) throw new AuthError("问题不存在", 404);
  await db.prepare(`INSERT INTO problem_views (problem_id,member_id,viewed_at) VALUES (?,?,?)
    ON CONFLICT(problem_id,member_id) DO UPDATE SET viewed_at = excluded.viewed_at`)
    .bind(problemId, viewer.id, new Date().toISOString()).run();

  const people = await db
    .prepare(`SELECT
      m.id,
      m.username,
      m.display_name AS displayName,
      m.initials,
      m.avatar_updated_at AS avatarUpdatedAt,
      m.specialties,
      pm.relation,
      pm.is_manager AS isManager,
      pm.joined_at AS joinedAt,
      EXISTS(SELECT 1 FROM messages adopted WHERE adopted.problem_id = pm.problem_id AND adopted.author_id = m.id AND adopted.is_adopted = 1) AS isAdopted
    FROM problem_members pm
    JOIN members m ON m.id = pm.member_id
    WHERE pm.problem_id = ?
    ORDER BY CASE pm.relation WHEN 'participating' THEN 0 ELSE 1 END, pm.joined_at ASC`)
    .bind(problemId)
    .all<PersonRow>();

  const messageRows = await db
    .prepare(`SELECT
      message.id,
      message.problem_id AS problemId,
      message.parent_id AS parentId,
      message.body,
      message.kind,
      message.is_hidden AS isHidden,
      message.is_adopted AS isAdopted,
      message.upvotes,
      message.created_at AS createdAt,
      message.updated_at AS updatedAt,
      author.id AS authorId,
      author.display_name AS authorName,
      author.username AS authorUsername,
      author.initials AS authorInitials,
      author.avatar_updated_at AS authorAvatarUpdatedAt,
      EXISTS(SELECT 1 FROM message_votes vote WHERE vote.message_id = message.id AND vote.member_id = ?) AS isVoted
    FROM messages message
    JOIN members author ON author.id = message.author_id
    WHERE message.problem_id = ?
    ORDER BY message.created_at ASC`)
    .bind(viewer.id, problemId)
    .all<MessageRow>();

  const viewerMembership = people.results.find((person) => person.id === viewer.id);
  const isCreator = problem.creatorId === viewer.id;
  const isManager = Boolean(viewerMembership?.isManager);
  const canModerateComments = isCreator || isManager || viewer.role === "admin" || viewer.role === "superadmin";
  const locked = isCreator || isManager || Boolean(viewerMembership?.isAdopted);
  const allMembers = (isCreator || isManager) ? await db
    .prepare(`SELECT id, username, display_name AS displayName, initials
      FROM members
      WHERE account_status = 'active' AND id NOT IN (SELECT member_id FROM problem_members WHERE problem_id = ?)
      ORDER BY display_name ASC LIMIT 100`)
    .bind(problemId)
    .all<{ id: string; username: string; displayName: string; initials: string }>() : { results: [] };

  const messageById = new Map(messageRows.results.map((message) => [message.id, message]));
  function hiddenRoot(message: MessageRow) {
    let current: MessageRow | undefined = message;
    let hidden: MessageRow | null = null;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.isHidden) hidden = current;
      current = current.parentId ? messageById.get(current.parentId) : undefined;
    }
    return hidden;
  }
  const visibleMessages = messageRows.results.flatMap((message) => {
    const root = hiddenRoot(message);
    if (root && !canModerateComments && root.authorId !== viewer.id) return [];
    return [{
      ...message,
      isHidden: Boolean(message.isHidden),
      isHiddenBranch: Boolean(root),
      isAdopted: Boolean(message.isAdopted),
      isVoted: Boolean(message.isVoted),
      upvotes: Number(message.upvotes),
      canHide: message.authorId === viewer.id,
      canDelete: canModerateComments,
    }];
  });

  return {
    problem: { ...problem, tags: splitList(problem.tags) },
    participants: people.results.filter((person) => person.relation === "participating").map((person) => ({
      ...person,
      isManager: Boolean(person.isManager),
      isAdopted: Boolean(person.isAdopted),
      specialties: jsonArray(person.specialties),
      isCreator: person.id === problem.creatorId,
    })),
    followers: people.results.filter((person) => person.relation === "following").map((person) => ({
      ...person,
      isManager: false,
      isAdopted: false,
      specialties: jsonArray(person.specialties),
      isCreator: false,
    })),
    messages: visibleMessages,
    viewer: {
      ...viewer,
      relation: viewerMembership?.relation ?? "watching",
      locked,
      isCreator,
      isManager,
      canManageParticipants: isCreator || isManager,
      canEditProblem: isCreator,
      canAdopt: isCreator,
      canModerateComments,
    },
    availableMembers: allMembers.results,
  };
}

async function problemAuthority(problemId: string, viewer: SessionMember) {
  const row = await database()
    .prepare(`SELECT
      p.creator_id AS creatorId,
      p.is_hidden AS isHidden,
      COALESCE(pm.is_manager, 0) AS isManager,
      COALESCE(pm.relation, 'watching') AS relation,
      EXISTS(SELECT 1 FROM messages adopted WHERE adopted.problem_id = p.id AND adopted.author_id = ? AND adopted.is_adopted = 1) AS isAdopted
    FROM problems p
    LEFT JOIN problem_members pm ON pm.problem_id = p.id AND pm.member_id = ?
    WHERE p.id = ?`)
    .bind(viewer.id, viewer.id, problemId)
    .first<{ creatorId: string; isHidden: number; isManager: number; relation: string; isAdopted: number }>();
  if (!row) throw new AuthError("问题不存在", 404);
  return { ...row, isHidden: Boolean(row.isHidden), isCreator: row.creatorId === viewer.id, isManager: Boolean(row.isManager), isAdopted: Boolean(row.isAdopted) };
}

async function notifyProblem(problemId: string, actorId: string, kind: string, summary: string) {
  const db = database();
  const audience = await db
    .prepare(`SELECT member_id AS memberId FROM problem_members WHERE problem_id = ? AND member_id != ?
      UNION SELECT creator_id AS memberId FROM problems WHERE id = ? AND creator_id != ?`)
    .bind(problemId, actorId, problemId, actorId)
    .all<{ memberId: string }>();
  if (!audience.results.length) return;
  const now = new Date().toISOString();
  await db.batch(audience.results.map((item) => db
    .prepare("INSERT INTO notifications (id,member_id,problem_id,kind,summary,created_at,read_at) VALUES (?,?,?,?,?,?,NULL)")
    .bind(`notification-${crypto.randomUUID()}`, item.memberId, problemId, kind, summary, now)));
}

export async function applyProblemAction(problemId: string, viewer: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  const action = asString(payload.action, 40);
  const db = database();
  const authority = await problemAuthority(problemId, viewer);
  if (authority.isHidden && viewer.role !== "admin" && viewer.role !== "superadmin") throw new AuthError("问题不存在", 404);
  const now = new Date().toISOString();

  if (action === "relationship") {
    const relation = asString(payload.relation, 20);
    if (!(["watching", "following", "participating"] as string[]).includes(relation)) throw new AuthError("关系状态无效");
    if (relation !== "participating" && (authority.isCreator || authority.isManager || authority.isAdopted)) {
      throw new AuthError("创建者、管理者或内容被采纳者必须保持参与状态");
    }
    if (relation === "watching") {
      await db.prepare("DELETE FROM problem_members WHERE problem_id = ? AND member_id = ?").bind(problemId, viewer.id).run();
    } else {
      await db.prepare(`INSERT INTO problem_members (problem_id,member_id,relation,is_manager,joined_at)
        VALUES (?,?,?,0,?)
        ON CONFLICT(problem_id,member_id) DO UPDATE SET relation = excluded.relation`)
        .bind(problemId, viewer.id, relation, now).run();
    }
    await notifyProblem(problemId, viewer.id, "relationship", `${viewer.displayName}更新了参与状态`);
    return;
  }

  if (action === "create_message") {
    const body = asString(payload.body, 20_000);
    const parentId = asString(payload.parentId, 100) || null;
    if (!body) throw new AuthError("消息不能为空");
    if (parentId) {
      const parent = await db.prepare("SELECT id FROM messages WHERE id = ? AND problem_id = ?").bind(parentId, problemId).first();
      if (!parent) throw new AuthError("回复的消息不存在", 404);
    }
    await db.prepare("INSERT INTO messages (id,problem_id,parent_id,author_id,body,kind,is_adopted,upvotes,created_at,updated_at) VALUES (?,?,?,?,?,NULL,0,0,?,?)")
      .bind(`message-${crypto.randomUUID()}`, problemId, parentId, viewer.id, body, now, now).run();
    await db.prepare("UPDATE problems SET updated_at = ? WHERE id = ?").bind(now, problemId).run();
    await notifyProblem(problemId, viewer.id, parentId ? "reply" : "discussion", `${viewer.displayName}${parentId ? "回复了讨论" : "发表了新讨论"}`);
    return;
  }

  if (["message_label", "message_vote", "message_adopt", "message_hide", "message_delete"].includes(action)) {
    const messageId = asString(payload.messageId, 100);
    const message = await db
      .prepare("SELECT id,author_id AS authorId,kind,is_hidden AS isHidden,is_adopted AS isAdopted FROM messages WHERE id = ? AND problem_id = ?")
      .bind(messageId, problemId)
      .first<{ id: string; authorId: string; kind: string | null; isHidden: number; isAdopted: number }>();
    if (!message) throw new AuthError("消息不存在", 404);
    const canModerateComments = authority.isCreator || authority.isManager || viewer.role === "admin" || viewer.role === "superadmin";
    const hiddenRoot = await db.prepare(`WITH RECURSIVE ancestry(id,parent_id,author_id,is_hidden,depth) AS (
        SELECT id,parent_id,author_id,is_hidden,0 FROM messages WHERE id = ? AND problem_id = ?
        UNION ALL
        SELECT parent.id,parent.parent_id,parent.author_id,parent.is_hidden,ancestry.depth + 1
        FROM messages parent JOIN ancestry ON parent.id = ancestry.parent_id
      )
      SELECT author_id AS authorId FROM ancestry WHERE is_hidden = 1 ORDER BY depth DESC LIMIT 1`)
      .bind(messageId, problemId).first<{ authorId: string }>();
    if (hiddenRoot && !canModerateComments && hiddenRoot.authorId !== viewer.id) throw new AuthError("消息不存在", 404);

    if (action === "message_label") {
      const kind = asString(payload.kind, 10);
      if (!(["解法", "见解", "反例"] as string[]).includes(kind)) throw new AuthError("消息标记无效");
      await db.prepare("UPDATE messages SET kind = ?, updated_at = ? WHERE id = ?")
        .bind(message.kind === kind ? null : kind, now, messageId).run();
      return;
    }

    if (action === "message_vote") {
      const existing = await db.prepare("SELECT message_id FROM message_votes WHERE message_id = ? AND member_id = ?")
        .bind(messageId, viewer.id).first();
      if (existing) {
        await db.batch([
          db.prepare("DELETE FROM message_votes WHERE message_id = ? AND member_id = ?").bind(messageId, viewer.id),
          db.prepare("UPDATE messages SET upvotes = MAX(0, upvotes - 1) WHERE id = ?").bind(messageId),
        ]);
      } else {
        await db.batch([
          db.prepare("INSERT INTO message_votes (message_id,member_id,created_at) VALUES (?,?,?)").bind(messageId, viewer.id, now),
          db.prepare("UPDATE messages SET upvotes = upvotes + 1 WHERE id = ?").bind(messageId),
        ]);
      }
      return;
    }

    if (action === "message_hide") {
      if (message.authorId !== viewer.id) throw new AuthError("只能隐藏自己的评论", 403);
      const nextHidden = !message.isHidden;
      await db.prepare("UPDATE messages SET is_hidden = ?, is_adopted = CASE WHEN ? = 1 THEN 0 ELSE is_adopted END, updated_at = ? WHERE id = ?")
        .bind(nextHidden ? 1 : 0, nextHidden ? 1 : 0, now, messageId).run();
      return;
    }

    if (action === "message_delete") {
      if (!canModerateComments) throw new AuthError("只有问题管理者或站点管理员可以删除评论", 403);
      await db.batch([
        db.prepare(`WITH RECURSIVE descendants(id) AS (
          SELECT id FROM messages WHERE id = ? AND problem_id = ?
          UNION
          SELECT child.id FROM messages child JOIN descendants parent ON child.parent_id = parent.id
          WHERE child.problem_id = ?
        ) DELETE FROM messages WHERE id IN (SELECT id FROM descendants)`).bind(messageId, problemId, problemId),
        db.prepare("UPDATE problems SET updated_at = ? WHERE id = ?").bind(now, problemId),
      ]);
      return;
    }

    if (!authority.isCreator) throw new AuthError("只有创建者可以采纳消息", 403);
    const adopted = !message.isAdopted;
    await db.batch([
      db.prepare("UPDATE messages SET is_adopted = ?, updated_at = ? WHERE id = ?").bind(adopted ? 1 : 0, now, messageId),
      ...(adopted ? [db.prepare(`INSERT INTO problem_members (problem_id,member_id,relation,is_manager,joined_at)
        VALUES (?,?,'participating',0,?)
        ON CONFLICT(problem_id,member_id) DO UPDATE SET relation = 'participating'`)
        .bind(problemId, message.authorId, now)] : []),
    ]);
    await notifyProblem(problemId, viewer.id, "adoption", adopted ? `${viewer.displayName}采纳了一条消息` : `${viewer.displayName}取消采纳一条消息`);
    return;
  }

  if (action === "participant") {
    if (!(authority.isCreator || authority.isManager)) throw new AuthError("没有参与者管理权限", 403);
    const targetId = asString(payload.memberId, 100);
    const participating = Boolean(payload.participating);
    const target = await problemAuthority(problemId, { ...viewer, id: targetId });
    if (!participating && (target.isCreator || target.isManager || target.isAdopted)) throw new AuthError("该成员必须保持参与状态");
    if (!authority.isCreator && target.isManager) throw new AuthError("管理者不能修改其他管理者", 403);
    if (participating) {
      await db.prepare(`INSERT INTO problem_members (problem_id,member_id,relation,is_manager,joined_at)
        VALUES (?,?,'participating',0,?)
        ON CONFLICT(problem_id,member_id) DO UPDATE SET relation = 'participating'`)
        .bind(problemId, targetId, now).run();
    } else {
      await db.prepare("DELETE FROM problem_members WHERE problem_id = ? AND member_id = ?").bind(problemId, targetId).run();
    }
    await notifyProblem(problemId, viewer.id, "relationship", `${viewer.displayName}更新了参与者名单`);
    return;
  }

  if (action === "manager") {
    if (!authority.isCreator) throw new AuthError("只有创建者可以设置管理者", 403);
    const targetId = asString(payload.memberId, 100);
    if (targetId === authority.creatorId) throw new AuthError("创建者无需重复任命");
    const isManager = Boolean(payload.isManager);
    await db.prepare(`INSERT INTO problem_members (problem_id,member_id,relation,is_manager,joined_at)
      VALUES (?,?,'participating',?,?)
      ON CONFLICT(problem_id,member_id) DO UPDATE SET relation = 'participating', is_manager = excluded.is_manager`)
      .bind(problemId, targetId, isManager ? 1 : 0, now).run();
    await notifyProblem(problemId, viewer.id, "relationship", `${viewer.displayName}${isManager ? "任命" : "取消"}了一位管理者`);
    return;
  }

  if (action === "update_problem") {
    if (!authority.isCreator) throw new AuthError("只有创建者可以修改问题", 403);
    const title = asString(payload.title, 140);
    const body = asString(payload.body, 30_000);
    const background = asString(payload.background, 20_000);
    const status = asString(payload.status, 20);
    const tags = cleanTags(payload.tags);
    if (!title || !body || !tags.length) throw new AuthError("请填写标题、正文并至少添加一个标签");
    if (!(["开放", "已解决"] as string[]).includes(status)) throw new AuthError("问题状态无效");
    await db.batch([
      db.prepare("UPDATE problems SET title = ?, body = ?, background = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(title, body, background, status, now, problemId),
      db.prepare("DELETE FROM problem_tags WHERE problem_id = ?").bind(problemId),
      ...tags.map((tag) => db.prepare("INSERT INTO problem_tags (problem_id,tag) VALUES (?,?)").bind(problemId, tag)),
    ]);
    await notifyProblem(problemId, viewer.id, "status", `${viewer.displayName}更新了问题内容或状态`);
    return;
  }

  throw new AuthError("未知操作");
}

type ProfileRow = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUpdatedAt: string | null;
  bio: string;
  location: string;
  publicEmail: string;
  specialties: string;
  role: string;
  inviteQuota: number;
  createdAt: string;
};

export async function getMemberProfile(targetId: string, viewer: SessionMember) {
  await ensureDatabase();
  const db = database();
  const member = await db
    .prepare(`SELECT id,email,username,display_name AS displayName,initials,avatar_updated_at AS avatarUpdatedAt,bio,location,public_email AS publicEmail,
      specialties,role,invite_quota AS inviteQuota,created_at AS createdAt FROM members WHERE id = ?`)
    .bind(targetId).first<ProfileRow>();
  if (!member) throw new AuthError("成员不存在", 404);
  const problemRows = await db
    .prepare(`SELECT p.id,p.short_code AS shortCode,p.title,p.status,p.updated_at AS updatedAt,
      pm.relation,CASE WHEN p.creator_id = ? THEN 1 ELSE 0 END AS isCreator,
      (SELECT viewed_at FROM problem_views pv WHERE pv.problem_id = p.id AND pv.member_id = ?) AS lastViewedAt,
      CASE WHEN EXISTS(SELECT 1 FROM messages authored WHERE authored.problem_id = p.id AND authored.author_id = ?)
        OR EXISTS(SELECT 1 FROM message_votes voted JOIN messages voted_message ON voted_message.id = voted.message_id
          WHERE voted_message.problem_id = p.id AND voted.member_id = ?) THEN 1 ELSE 0 END AS hasInteracted
      FROM problems p
      LEFT JOIN problem_members pm ON pm.problem_id = p.id AND pm.member_id = ?
      WHERE (p.creator_id = ? OR pm.member_id IS NOT NULL
        OR EXISTS(SELECT 1 FROM messages authored WHERE authored.problem_id = p.id AND authored.author_id = ?)
        OR EXISTS(SELECT 1 FROM message_votes voted JOIN messages voted_message ON voted_message.id = voted.message_id
          WHERE voted_message.problem_id = p.id AND voted.member_id = ?)
        OR EXISTS(SELECT 1 FROM problem_views pv WHERE pv.problem_id = p.id AND pv.member_id = ?))
        AND (p.is_hidden = 0 OR ? IN ('admin', 'superadmin'))
      ORDER BY p.updated_at DESC`)
    .bind(
      targetId,
      viewer.id === targetId ? targetId : "__private_footprints__",
      targetId,
      targetId,
      targetId,
      targetId,
      targetId,
      targetId,
      viewer.id === targetId ? targetId : "__private_footprints__",
      viewer.role,
    )
    .all<{ id: string; shortCode: string; title: string; status: string; updatedAt: string; relation: string | null; isCreator: number; lastViewedAt: string | null; hasInteracted: number }>();
  const invitations = viewer.id === targetId ? await db
    .prepare("SELECT code,created_at AS createdAt,used_at AS usedAt FROM invitation_codes WHERE created_by = ? ORDER BY created_at DESC LIMIT 20")
    .bind(targetId).all<{ code: string; createdAt: string; usedAt: string | null }>() : { results: [] };
  return {
    member: { ...member, specialties: jsonArray(member.specialties), inviteQuota: Number(member.inviteQuota) },
    problems: problemRows.results.map((problem) => ({ ...problem, isCreator: Boolean(problem.isCreator), hasInteracted: Boolean(problem.hasInteracted) })),
    invitations: invitations.results,
    viewer: {
      id: viewer.id,
      isSelf: viewer.id === targetId,
      canEditQuota: viewer.role === "superadmin" && viewer.id !== targetId,
    },
  };
}

export async function generateInvitation(viewer: SessionMember) {
  await ensureDatabase();
  const db = database();
  const outstanding = await db.prepare("SELECT code FROM invitation_codes WHERE created_by = ? AND used_by IS NULL LIMIT 1")
    .bind(viewer.id).first<{ code: string }>();
  if (outstanding) throw new AuthError("已有尚未使用的邀请码，请等待使用后再生成");
  const member = await db.prepare("SELECT invite_quota AS inviteQuota FROM members WHERE id = ?")
    .bind(viewer.id).first<{ inviteQuota: number }>();
  if (!member || Number(member.inviteQuota) <= 0) throw new AuthError("当前没有可用邀请额度");
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const code = `MATH-${raw.slice(0, 4)}-${raw.slice(4)}`;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE members SET invite_quota = invite_quota - 1 WHERE id = ? AND invite_quota > 0").bind(viewer.id),
    db.prepare("INSERT INTO invitation_codes (code,created_by,used_by,created_at,used_at) VALUES (?,?,NULL,?,NULL)")
      .bind(code, viewer.id, now),
  ]);
  return { code };
}

export async function updateInviteQuota(targetId: string, viewer: SessionMember, quotaValue: unknown) {
  await ensureDatabase();
  if (viewer.role !== "superadmin" || viewer.id === targetId) throw new AuthError("只有超级管理员可以修改其他成员的邀请额度", 403);
  const quota = Number(quotaValue);
  if (!Number.isInteger(quota) || quota < 0 || quota > 10_000) throw new AuthError("邀请额度必须是 0 到 10000 的整数");
  await database().prepare("UPDATE members SET invite_quota = ? WHERE id = ?").bind(quota, targetId).run();
  return { quota };
}

export async function updateMemberProfile(targetId: string, viewer: SessionMember, payload: Record<string, unknown>) {
  await ensureDatabase();
  if (viewer.id !== targetId) throw new AuthError("只能修改自己的资料", 403);
  const displayName = asString(payload.displayName, 40);
  const bio = asString(payload.bio, 1_200);
  const location = asString(payload.location, 80);
  const publicEmail = asString(payload.publicEmail, 180);
  const specialties = cleanTags(payload.specialties);
  if (!displayName) throw new AuthError("显示名称不能为空");
  const initials = displayName.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  await database().prepare("UPDATE members SET display_name = ?, initials = ?, bio = ?, location = ?, public_email = ?, specialties = ? WHERE id = ?")
    .bind(displayName, initials, bio, location, publicEmail, JSON.stringify(specialties), targetId).run();
  return { ok: true };
}

type NotificationRow = {
  id: string;
  problemId: string;
  problemTitle: string;
  problemShortCode: string;
  kind: string;
  summary: string;
  createdAt: string;
  readAt: string | null;
};

export async function groupedNotifications(viewer: SessionMember) {
  await ensureDatabase();
  const rows = await database()
    .prepare(`SELECT n.id,n.problem_id AS problemId,p.title AS problemTitle,p.short_code AS problemShortCode,
      n.kind,n.summary,n.created_at AS createdAt,n.read_at AS readAt
      FROM notifications n JOIN problems p ON p.id = n.problem_id
      WHERE n.member_id = ? AND (p.is_hidden = 0 OR ? IN ('admin', 'superadmin'))
      ORDER BY n.created_at DESC LIMIT 100`)
    .bind(viewer.id, viewer.role).all<NotificationRow>();
  const groups = new Map<string, {
    problemId: string;
    problemTitle: string;
    problemShortCode: string;
    latestSummary: string;
    latestAt: string;
    unreadCount: number;
    totalCount: number;
  }>();
  for (const row of rows.results) {
    const group = groups.get(row.problemId);
    if (!group) {
      groups.set(row.problemId, {
        problemId: row.problemId,
        problemTitle: row.problemTitle,
        problemShortCode: row.problemShortCode,
        latestSummary: row.summary,
        latestAt: row.createdAt,
        unreadCount: row.readAt ? 0 : 1,
        totalCount: 1,
      });
    } else {
      group.totalCount += 1;
      if (!row.readAt) group.unreadCount += 1;
    }
  }
  const items = [...groups.values()];
  return { items, unreadCount: items.reduce((sum, item) => sum + item.unreadCount, 0) };
}

export async function markProblemNotificationsRead(problemId: string, viewer: SessionMember) {
  await ensureDatabase();
  await database().prepare("UPDATE notifications SET read_at = ? WHERE member_id = ? AND problem_id = ? AND read_at IS NULL")
    .bind(new Date().toISOString(), viewer.id, problemId).run();
}
