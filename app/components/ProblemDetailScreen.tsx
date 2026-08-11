"use client";

import Link from "next/link";
import {
  ArrowBigUp,
  ArrowLeft,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleX,
  Crown,
  Eye,
  EyeOff,
  FileCheck2,
  Lightbulb,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Reply,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { fullDate, relativeTime } from "../lib/format";
import type { DiscussionMessage, ProblemDetailData, ProblemPerson } from "../lib/types";
import { MarkdownContent } from "./MarkdownContent";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

const REPLIES_PER_PAGE = 50;
type TreeMessage = DiscussionMessage & { children: TreeMessage[] };

function buildMessageTree(messages: DiscussionMessage[]) {
  const map = new Map<string, TreeMessage>();
  for (const message of messages) map.set(message.id, { ...message, children: [] });
  const roots: TreeMessage[] = [];
  for (const message of map.values()) {
    if (message.parentId && map.has(message.parentId)) map.get(message.parentId)?.children.push(message);
    else roots.push(message);
  }
  const sort = (items: TreeMessage[]) => {
    items.sort((left, right) => Number(right.isAdopted) - Number(left.isAdopted) || right.upvotes - left.upvotes || left.createdAt.localeCompare(right.createdAt));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function MessageComposer({ onSubmit, placeholder, compact = false, initials = "", memberId = "", avatarUpdatedAt = null }: { onSubmit(body: string): Promise<void>; placeholder: string; compact?: boolean; initials?: string; memberId?: string; avatarUpdatedAt?: string | null }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);

  function resizeToContent() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "32px";
    textarea.style.height = `${Math.max(32, textarea.scrollHeight)}px`;
  }

  useLayoutEffect(resizeToContent, [body]);
  useEffect(() => {
    const label = labelRef.current;
    if (!label || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeToContent);
    observer.observe(label);
    return () => observer.disconnect();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = body.trim();
    if (!clean) return;
    setSending(true);
    await onSubmit(clean);
    setBody("");
    setSending(false);
  }

  return (
    <form className={`message-composer${compact ? " compact" : ""}`} onSubmit={submit}>
      {!compact && <MemberAvatar avatarUpdatedAt={avatarUpdatedAt} className="message-avatar" initials={initials} memberId={memberId} />}
      <label ref={labelRef}><span className="sr-only">{placeholder}</span><textarea onChange={(event) => setBody(event.target.value)} placeholder={placeholder} ref={textareaRef} rows={1} value={body} /></label>
      <button disabled={!body.trim() || sending} type="submit"><Send aria-hidden="true" size={14} /><span>{compact ? "回复" : "发送"}</span></button>
    </form>
  );
}

function MessageThread({
  message,
  canAdopt,
  action,
}: {
  message: TreeMessage;
  canAdopt: boolean;
  action(payload: Record<string, unknown>): Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replying, setReplying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(REPLIES_PER_PAGE);
  const visible = message.children.slice(0, visibleCount);
  const hidden = Math.max(0, message.children.length - visibleCount);

  return (
    <div className={`message-thread${expanded ? " has-children" : ""}${message.isHiddenBranch ? " hidden-branch" : ""}`} role="listitem">
      <article className="message-item">
        <div className="message-author-rail">
          <Link href={`/members/${message.authorId}`}><MemberAvatar avatarUpdatedAt={message.authorAvatarUpdatedAt} className="message-avatar" initials={message.authorInitials} memberId={message.authorId} /></Link>
          {message.kind && <span aria-label={message.kind} className="message-kind-icon" title={message.kind}>
            {message.kind === "解法" ? <FileCheck2 aria-hidden="true" size={15} /> : message.kind === "见解" ? <Lightbulb aria-hidden="true" size={15} /> : <CircleX aria-hidden="true" size={15} />}
          </span>}
        </div>
        <div className="message-copy">
          <header><Link href={`/members/${message.authorId}`}>{message.authorName}</Link><time>{relativeTime(message.createdAt)}</time>{message.isAdopted && <BadgeCheck aria-label="已采纳" size={14} />}</header>
          <MarkdownContent source={message.body} />
          <div className="message-labels">{message.isHiddenBranch && <span>已隐藏</span>}</div>
          <footer>
            <button aria-expanded={replying} onClick={() => setReplying((value) => !value)} type="button"><Reply aria-hidden="true" size={13} />回复</button>
            <button aria-pressed={message.isVoted} className={message.isVoted ? "active" : ""} onClick={() => void action({ action: "message_vote", messageId: message.id })} type="button"><ArrowBigUp aria-hidden="true" size={13} />顶 <b>{message.upvotes}</b></button>
            {message.children.length > 0 && <button aria-expanded={expanded} onClick={() => { setExpanded((value) => !value); setVisibleCount(REPLIES_PER_PAGE); }} type="button">{expanded ? <ChevronDown aria-hidden="true" size={13} /> : <ChevronRight aria-hidden="true" size={13} />}{expanded ? "收起回复" : `展开回复（${message.children.length}）`}</button>}
          </footer>
        </div>
        <button className="message-more" aria-label={`更多关于 ${message.authorName} 的操作`} onClick={() => setMenuOpen((value) => !value)} type="button"><MoreHorizontal aria-hidden="true" size={15} /></button>
        {menuOpen && <div className="message-menu">
          <button onClick={() => { void action({ action: "message_label", messageId: message.id, kind: "解法" }); setMenuOpen(false); }} type="button"><FileCheck2 aria-hidden="true" size={14} />{message.kind === "解法" ? "取消解法" : "解法"}</button>
          <button onClick={() => { void action({ action: "message_label", messageId: message.id, kind: "见解" }); setMenuOpen(false); }} type="button"><Lightbulb aria-hidden="true" size={14} />{message.kind === "见解" ? "取消见解" : "见解"}</button>
          <button onClick={() => { void action({ action: "message_label", messageId: message.id, kind: "反例" }); setMenuOpen(false); }} type="button"><CircleX aria-hidden="true" size={14} />{message.kind === "反例" ? "取消反例" : "反例"}</button>
          {message.canHide && <button onClick={() => { void action({ action: "message_hide", messageId: message.id }); setMenuOpen(false); }} type="button"><EyeOff aria-hidden="true" size={14} />{message.isHidden ? "取消隐藏" : "隐藏评论"}</button>}
          {canAdopt && <button onClick={() => { void action({ action: "message_adopt", messageId: message.id }); setMenuOpen(false); }} type="button"><BadgeCheck aria-hidden="true" size={14} />{message.isAdopted ? "取消采纳" : "采纳消息"}</button>}
          {message.canDelete && <button className="danger" onClick={() => { if (window.confirm("确认永久删除这条评论及其全部子评论吗？此操作无法恢复。")) void action({ action: "message_delete", messageId: message.id }); setMenuOpen(false); }} type="button"><Trash2 aria-hidden="true" size={14} />删除评论</button>}
        </div>}
      </article>
      {replying && <div className="inline-composer"><MessageComposer compact onSubmit={async (body) => { await action({ action: "create_message", parentId: message.id, body }); setReplying(false); setExpanded(true); }} placeholder={`回复 ${message.authorName}`} /></div>}
      {expanded && <div className="message-children" role="list">
        {visible.map((child) => <MessageThread action={action} canAdopt={canAdopt} key={child.id} message={child} />)}
        {hidden > 0 && <button className="load-more" onClick={() => setVisibleCount((count) => count + REPLIES_PER_PAGE)} type="button">展开更多（还有 {hidden} 条）<ChevronDown aria-hidden="true" size={14} /></button>}
      </div>}
    </div>
  );
}

function PersonRow({ person, data, action }: { person: ProblemPerson; data: ProblemDetailData; action(payload: Record<string, unknown>): Promise<void> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = data.viewer.canManageParticipants && !person.isCreator && (data.viewer.isCreator || !person.isManager);
  return (
    <article className="person-row">
      <Link href={`/members/${person.id}`}><MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} initials={person.initials} memberId={person.id} /><div><b>{person.displayName}</b><small>{person.specialties[0] || "数学"} · {relativeTime(person.joinedAt)}加入</small></div></Link>
      <div className="person-icons">
        {person.isCreator && <Crown aria-label="创建者" size={15} />}
        {person.isManager && <ShieldCheck aria-label="管理者" size={15} />}
        {person.isAdopted && <BadgeCheck aria-label="内容被采纳" size={15} />}
        {canManage && <button aria-label={`管理 ${person.displayName}`} onClick={() => setMenuOpen((value) => !value)} type="button"><MoreHorizontal aria-hidden="true" size={15} /></button>}
        {menuOpen && <div className="person-menu">
          {data.viewer.isCreator && <button onClick={() => { void action({ action: "manager", memberId: person.id, isManager: !person.isManager }); setMenuOpen(false); }} type="button"><ShieldCheck aria-hidden="true" size={14} />{person.isManager ? "取消管理" : "任命管理"}</button>}
          {!person.isManager && !person.isAdopted && <button onClick={() => { void action({ action: "participant", memberId: person.id, participating: false }); setMenuOpen(false); }} type="button"><Trash2 aria-hidden="true" size={14} />移出参与者</button>}
        </div>}
      </div>
    </article>
  );
}

function ParticipantPanel({ data, action }: { data: ProblemDetailData; action(payload: Record<string, unknown>): Promise<void> }) {
  const [selectedMember, setSelectedMember] = useState("");
  const relationshipLabels = { watching: "旁观", following: "关注", participating: "参与" } as const;
  const order = ["watching", "following", "participating"] as const;
  const next = order[(order.indexOf(data.viewer.relation) + 1) % order.length];

  return (
    <aside className="people-panel">
      <section>
        <header><Users aria-hidden="true" size={15} /><div><b>参与者</b><span>共同推进这个问题</span></div><strong>{String(data.participants.length).padStart(2, "0")}</strong></header>
        <div>{data.participants.map((person) => <PersonRow action={action} data={data} key={person.id} person={person} />)}</div>
        {data.viewer.canManageParticipants && data.availableMembers.length > 0 && <form className="add-participant" onSubmit={(event) => { event.preventDefault(); if (!selectedMember) return; void action({ action: "participant", memberId: selectedMember, participating: true }); setSelectedMember(""); }}><select aria-label="选择成员" onChange={(event) => setSelectedMember(event.target.value)} value={selectedMember}><option value="">添加参与者</option>{data.availableMembers.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select><button disabled={!selectedMember} type="submit"><Plus aria-hidden="true" size={14} /><span className="sr-only">添加</span></button></form>}
      </section>

      <section>
        <header><Eye aria-hidden="true" size={15} /><div><b>关注者</b><span>未参与的关注者</span></div><strong>{String(data.followers.length).padStart(2, "0")}</strong></header>
        <div>{data.followers.map((person) => <article className="person-row follower" key={person.id}><Link href={`/members/${person.id}`}><MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} initials={person.initials} memberId={person.id} /><div><b>{person.displayName}</b><small>{person.specialties[0] || "数学"}</small></div></Link></article>)}</div>
      </section>

      <button className={`relationship-button ${data.viewer.relation}`} disabled={data.viewer.locked} onClick={() => void action({ action: "relationship", relation: next })} title={data.viewer.locked ? "当前身份必须保持参与" : `点击切换为${relationshipLabels[next]}`} type="button">
        {data.viewer.relation === "watching" ? <Eye aria-hidden="true" size={15} /> : data.viewer.relation === "following" ? <Bell aria-hidden="true" size={15} /> : <Users aria-hidden="true" size={15} />}
        {relationshipLabels[data.viewer.relation]}
        {data.viewer.locked && <LockKeyhole aria-hidden="true" size={12} />}
      </button>
    </aside>
  );
}

export function ProblemDetailScreen({ problemId }: { problemId: string }) {
  const [data, setData] = useState<ProblemDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageFilter, setMessageFilter] = useState<"all" | "tagged" | "解法" | "见解" | "反例">("all");

  async function load() {
    const response = await fetch(`/api/problems/${problemId}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign(`/login?returnTo=${encodeURIComponent(`/problems/${problemId}`)}`); return; }
    const next = await response.json() as ProblemDetailData & { message?: string };
    if (!response.ok) throw new Error(next.message ?? "读取失败");
    setData(next);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "读取失败")).finally(() => setLoading(false));
    // The problem id is the complete resource identity for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  async function action(payload: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/problems/${problemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "操作失败"); return; }
    await load();
  }

  const filteredMessages = useMemo(() => {
    const messages = data?.messages ?? [];
    if (messageFilter === "all") return messages;
    if (messageFilter === "tagged") return messages.filter((item) => Boolean(item.kind));
    return messages.filter((item) => item.kind === messageFilter);
  }, [data?.messages, messageFilter]);
  const tree = useMemo(() => buildMessageTree(filteredMessages), [filteredMessages]);

  if (loading) return <div className="site-shell"><SiteHeader active="problems" /><main className="loading-page">正在读取问题…</main></div>;
  if (!data) return <div className="site-shell"><SiteHeader active="problems" /><main className="loading-page">{message || "问题不存在"}</main></div>;

  const messageFilterOptions = [
    { value: "all", label: "全部" },
    { value: "tagged", label: "带标签" },
    { value: "解法", label: "解法" },
    { value: "见解", label: "见解" },
    { value: "反例", label: "反例" },
  ] as const;

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="problem-detail-page">
        <article className="problem-detail-grid">
          <header className="problem-title">
            <Link href="/problems"><ArrowLeft aria-hidden="true" size={14} />返回难题</Link>
            <p><code>{data.problem.shortCode}</code><span>{data.problem.tags.join(" · ")}</span><i>{data.problem.status}</i></p>
            <h1>{data.problem.title}</h1>
            <small><Link href={`/members/${data.problem.creatorId}`}>{data.problem.creatorName}</Link>提出 · {fullDate(data.problem.createdAt)}</small>
          </header>

          <section className="problem-main-column">
            {data.problem.background && <details className="problem-background"><summary><ChevronDown aria-hidden="true" size={14} />背景与已知进展</summary><MarkdownContent source={data.problem.background} /></details>}
            <MarkdownContent className="problem-body" source={data.problem.body} />
            {data.viewer.isCreator && <div className="problem-actions"><button className={data.problem.status === "已解决" ? "solved" : ""} onClick={() => void action({ action: "update_problem", title: data.problem.title, body: data.problem.body, background: data.problem.background, tags: data.problem.tags, status: data.problem.status === "已解决" ? "开放" : "已解决" })} type="button"><CheckCircle2 aria-hidden="true" size={14} />{data.problem.status === "已解决" ? "重新开放" : "标记为解决"}</button><Link href={`/problems/${problemId}/settings`}><Settings2 aria-hidden="true" size={14} />问题设置</Link></div>}

            <section className="discussion-area">
              <header><h2>讨论</h2><span>{data.messages.length} 条消息</span></header>
              <MessageComposer avatarUpdatedAt={data.viewer.avatarUpdatedAt} initials={data.viewer.initials} memberId={data.viewer.id} onSubmit={(body) => action({ action: "create_message", body })} placeholder="补充解法、见解或反例；支持 Markdown 与数学公式" />
              <p className="form-message" aria-live="polite">{message}</p>
              <details className="filter-panel message-filter-panel">
                <summary><span><SlidersHorizontal aria-hidden="true" size={15} />筛选讨论</span><span>{filteredMessages.length} 条结果</span></summary>
                <div className="message-filter-options">
                  <span>消息类型</span>
                  <div aria-label="筛选评论标签" role="group">
                  {messageFilterOptions.map(({ value, label }) => (
                    <button
                      aria-pressed={messageFilter === value}
                      className={messageFilter === value ? "active" : ""}
                      key={value}
                      onClick={() => setMessageFilter(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                  </div>
                </div>
              </details>
              <div className="message-list" role="list">{tree.map((root) => <MessageThread action={action} canAdopt={data.viewer.canAdopt} key={root.id} message={root} />)}</div>
              {!tree.length && <p className="empty-state">没有符合当前标签筛选的评论。</p>}
            </section>
          </section>

          <ParticipantPanel action={action} data={data} />
        </article>
      </main>
    </div>
  );
}
