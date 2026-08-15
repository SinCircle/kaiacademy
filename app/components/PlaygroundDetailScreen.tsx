"use client";

import {
  ArrowBigUp,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  MoreHorizontal,
  Pencil,
  Reply,
  Sparkle,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PLAYGROUND_COMMENT_MARKERS,
  comparePlaygroundCommentRank,
  externalResourceHost,
  formatResourceBytes,
  type PlaygroundComment,
  type PlaygroundCommentMarker,
  type PlaygroundDetailData,
  type PlaygroundResource,
} from "../lib/playground";
import { ClientFetchError, getCachedJson, invalidateClientCache, refreshCachedJson } from "../lib/client-cache";
import { fullDate, relativeTime } from "../lib/format";
import { AppLink as Link } from "./AppLink";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownTitle } from "./MarkdownTitle";
import { MemberAvatar } from "./MemberAvatar";
import { MessageComposer } from "./MessageComposer";
import { SiteHeader } from "./SiteHeader";
import { CommentReactions } from "./CommentReactions";

type ActionPayload = Record<string, unknown>;
type CommentFilter = "all" | "marked" | PlaygroundCommentMarker;
type TreeComment = PlaygroundComment & { children: TreeComment[] };
const REPLIES_PER_PAGE = 50;

function buildCommentTree(comments: PlaygroundComment[]) {
  const map = new Map<string, TreeComment>();
  for (const comment of comments) map.set(comment.id, { ...comment, children: [] });
  const roots: TreeComment[] = [];
  for (const comment of map.values()) {
    if (comment.parentId && map.has(comment.parentId)) map.get(comment.parentId)?.children.push(comment);
    else roots.push(comment);
  }
  const sort = (items: TreeComment[]) => {
    items.sort(comparePlaygroundCommentRank);
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function PlaygroundCommentThread({ comment, action }: {
  comment: TreeComment;
  action(payload: ActionPayload, confirmText?: string): Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replying, setReplying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(REPLIES_PER_PAGE);
  const visible = comment.children.slice(0, visibleCount);
  const hidden = Math.max(0, comment.children.length - visibleCount);
  const canOpenMenu = comment.canFeature || comment.canHide || comment.canDelete;

  return <div className={`message-thread${expanded ? " has-children" : ""}${comment.isHiddenBranch ? " hidden-branch" : ""}`} role="listitem">
    <article className="message-item">
      <div className="message-author-rail">
        <Link href={`/members/${comment.authorId}`}><MemberAvatar avatarUpdatedAt={comment.authorAvatarUpdatedAt} className="message-avatar" initials={comment.authorInitials} memberId={comment.authorId} /></Link>
        {comment.isFeatured && <div className="message-author-indicators">
          {comment.isFeatured && <Sparkle aria-label="精选评论" className="playground-featured-icon" size={15} />}
        </div>}
      </div>
      <div className="message-copy">
        <header><Link href={`/members/${comment.authorId}`}>{comment.authorName}</Link><time>{relativeTime(comment.createdAt)}</time></header>
        <MarkdownContent source={comment.body} />
        <div className="message-labels">{comment.isHiddenBranch && <span>已隐藏</span>}</div>
        <footer>
          <button aria-expanded={replying} onClick={() => setReplying((value) => !value)} type="button"><Reply aria-hidden="true" size={13} />回复</button>
          <button aria-pressed={comment.isVoted} className={comment.isVoted ? "active" : ""} onClick={() => void action({ action: "toggle_comment_vote", commentId: comment.id })} type="button"><ArrowBigUp aria-hidden="true" size={13} />顶 <b>{comment.upvotes}</b></button>
          <CommentReactions onToggle={(marker) => void action({ action: "toggle_comment_reaction", commentId: comment.id, marker })} reactions={comment.reactions} />
          {comment.children.length > 0 && <button aria-expanded={expanded} onClick={() => { setExpanded((value) => !value); setVisibleCount(REPLIES_PER_PAGE); }} type="button">{expanded ? <ChevronDown aria-hidden="true" size={13} /> : <ChevronRight aria-hidden="true" size={13} />}{expanded ? "收起回复" : `展开回复（${comment.children.length}）`}</button>}
        </footer>
      </div>
      {canOpenMenu && <button aria-label={`更多关于 ${comment.authorName} 的操作`} className="message-more" onClick={() => setMenuOpen((value) => !value)} type="button"><MoreHorizontal aria-hidden="true" size={15} /></button>}
      {menuOpen && canOpenMenu && <div className="message-menu playground-message-menu">
        {comment.canFeature && <button onClick={() => { void action({ action: "toggle_comment_featured", commentId: comment.id }); setMenuOpen(false); }} type="button"><Sparkle aria-hidden="true" size={14} />{comment.isFeatured ? "取消精选" : "设为精选"}</button>}
        {comment.canHide && <button onClick={() => { void action({ action: "set_comment_hidden", commentId: comment.id, hidden: !comment.isHidden }, comment.isHidden ? undefined : "隐藏后，其他人将看不到这条评论及全部子评论。确定继续吗？"); setMenuOpen(false); }} type="button">{comment.isHidden ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}{comment.isHidden ? "取消隐藏" : "隐藏评论"}</button>}
        {comment.canDelete && <button className="danger" onClick={() => { void action({ action: "delete_comment", commentId: comment.id }, "这会删除该评论及全部子评论，且无法恢复。确定删除吗？"); setMenuOpen(false); }} type="button"><Trash2 aria-hidden="true" size={14} />删除评论</button>}
      </div>}
    </article>
    {replying && <div className="inline-composer"><MessageComposer allowAttachments={false} compact onSubmit={async (draft) => { const sent = await action({ action: "create_comment", parentId: comment.id, body: draft.body }); if (sent) { setReplying(false); setExpanded(true); } return sent; }} placeholder={`回复 ${comment.authorName}`} /></div>}
    {expanded && <div className="message-children" role="list">
      {visible.map((child) => <PlaygroundCommentThread action={action} comment={child} key={child.id} />)}
      {hidden > 0 && <button className="load-more" onClick={() => setVisibleCount((count) => count + REPLIES_PER_PAGE)} type="button">展开更多（还有 {hidden} 条）<ChevronDown aria-hidden="true" size={14} /></button>}
    </div>}
  </div>;
}

export function PlaygroundDetailScreen({ postId }: { postId: string }) {
  const [data, setData] = useState<PlaygroundDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [externalResource, setExternalResource] = useState<PlaygroundResource | null>(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const result = fresh
        ? await refreshCachedJson<PlaygroundDetailData>(`/api/playground/${postId}`)
        : await getCachedJson<PlaygroundDetailData>(`/api/playground/${postId}`, { onUpdate: setData });
      setData(result);
      invalidateClientCache(["/api/playground"]);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败");
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);

  function requireLogin() {
    if (data?.viewer) return true;
    window.location.assign(`/login?returnTo=${encodeURIComponent(`/playground/${postId}`)}`);
    return false;
  }

  async function action(payload: ActionPayload, confirmText?: string) {
    if (!requireLogin()) return false;
    if (confirmText && !window.confirm(confirmText)) return false;
    setMessage("");
    try {
      const response = await fetch(`/api/playground/${postId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new ClientFetchError(result.message ?? "操作失败", response.status);
      invalidateClientCache([`/api/playground/${postId}`, "/api/playground", "/api/admin/playground", "/api/members/"]);
      await load(true);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
      return false;
    }
  }

  const filteredComments = useMemo(() => {
    const comments = data?.comments ?? [];
    if (commentFilter === "all") return comments;
    if (commentFilter === "marked") return comments.filter((comment) => comment.reactions.length > 0);
    return comments.filter((comment) => comment.reactions.some((reaction) => reaction.emoji === commentFilter));
  }, [commentFilter, data?.comments]);
  const tree = useMemo(() => buildCommentTree(filteredComments), [filteredComments]);

  if (loading && !data) return <div className="site-shell"><SiteHeader active="playground" /><main className="loading-page">正在读取内容…</main></div>;
  if (!data) return <div className="site-shell"><SiteHeader active="playground" /><main className="playground-detail-page"><Link className="page-back" href="/playground"><ArrowLeft aria-hidden="true" size={14} />返回游乐场</Link><p className="page-message">{message || "内容不存在"}</p></main></div>;

  const { post } = data;
  const commentFilterOptions = [
    { value: "all", label: "全部", ariaLabel: "显示全部评论" },
    { value: "marked", label: "带标记", ariaLabel: "只显示带表情标记的评论" },
    ...PLAYGROUND_COMMENT_MARKERS.map((option) => ({ value: option.emoji, label: option.emoji, ariaLabel: option.label })),
  ] as const;

  return <div className="site-shell">
    <SiteHeader active="playground" />
    <main className="playground-detail-page">
      <Link className="page-back" href="/playground"><ArrowLeft aria-hidden="true" size={14} />返回游乐场</Link>
      <article className="playground-article">
        <header>
          <div className="playground-detail-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <h1><MarkdownTitle source={post.title} /></h1>
          <Link className="playground-detail-author" href={`/members/${post.authorId}`}><MemberAvatar avatarUpdatedAt={post.authorAvatarUpdatedAt} initials={post.authorInitials} memberId={post.authorId} /><span><b>{post.authorName}</b><small>@{post.authorUsername} · 发布于 {fullDate(post.createdAt)}{post.updatedAt !== post.createdAt ? ` · ${relativeTime(post.updatedAt)}更新` : ""}</small></span></Link>
        </header>

        <MarkdownContent className="playground-body" source={post.body} />

        <div className="playground-actions">
          <button className={post.isVoted ? "active" : ""} onClick={() => void action({ action: "toggle_vote" })} type="button"><ArrowUp aria-hidden="true" size={15} />顶 {post.upvotes}</button>
          <button className={post.isBookmarked ? "active" : ""} onClick={() => void action({ action: "toggle_bookmark" })} type="button"><Bookmark aria-hidden="true" size={15} />收藏 {post.bookmarkCount}</button>
          <span className="playground-view-count"><Eye aria-hidden="true" size={15} />浏览 {post.viewCount}</span>
          {data.viewer?.canEdit && <Link href={`/playground/${postId}/settings`}><Pencil aria-hidden="true" size={15} />编辑</Link>}
        </div>

        {data.resources.length > 0 && <section className="playground-resources">
          <header><h2>资源文件</h2></header>
          <div>{data.resources.map((resource) => resource.kind === "upload" ? <a className="playground-resource" download href={`/api/playground/resources/${resource.id}`} key={resource.id}>
            <File aria-hidden="true" size={20} /><span><b>{resource.displayName}</b><small>{resource.description || "本站文件"}</small></span><em>{formatResourceBytes(resource.byteSize)} · {resource.downloadCount} 次下载</em><Download aria-hidden="true" size={16} />
          </a> : <button className="playground-resource" key={resource.id} onClick={() => setExternalResource(resource)} type="button">
            <ExternalLink aria-hidden="true" size={20} /><span><b>{resource.displayName}</b><small>{resource.description || externalResourceHost(resource.externalUrl ?? "")}</small></span><em>外部链接</em><ExternalLink aria-hidden="true" size={16} />
          </button>)}</div>
        </section>}

        <section className="discussion-area playground-discussion">
          <header><h2>讨论</h2><span>{data.comments.length} 条消息</span></header>
          {data.viewer ? <MessageComposer allowAttachments={false} avatarUpdatedAt={data.viewer.avatarUpdatedAt} initials={data.viewer.initials} memberId={data.viewer.id} onSubmit={(draft) => action({ action: "create_comment", body: draft.body, parentId: null })} placeholder="补充说明、提出建议或分享资源使用体验；支持 Markdown 与数学公式" /> : <Link className="playground-login-discussion" href={`/login?returnTo=${encodeURIComponent(`/playground/${postId}`)}`}>登录后参与讨论</Link>}
          <p aria-live="polite" className="form-message">{message}</p>
          <details className="filter-panel message-filter-panel">
            <summary><span><SlidersHorizontal aria-hidden="true" size={15} />筛选讨论</span><span>{filteredComments.length} 条结果</span></summary>
            <div className="message-filter-options">
              <span>表情标记</span>
              <div aria-label="筛选评论表情标记" role="group">{commentFilterOptions.map((option) => <button aria-label={option.ariaLabel} aria-pressed={commentFilter === option.value} className={commentFilter === option.value ? "active" : ""} key={option.value} onClick={() => setCommentFilter(option.value)} title={option.ariaLabel} type="button">{option.label}</button>)}</div>
            </div>
          </details>
          <div className="message-list" role="list">{tree.map((root) => <PlaygroundCommentThread action={action} comment={root} key={root.id} />)}</div>
          {!tree.length && <p className="empty-state">没有符合当前表情筛选的评论。</p>}
        </section>
      </article>
    </main>

    {externalResource && <div className="playground-risk-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExternalResource(null); }}>
      <section aria-labelledby="external-risk-title" aria-modal="true" className="playground-risk-dialog" role="dialog">
        <button aria-label="关闭" className="playground-dialog-close" onClick={() => setExternalResource(null)} type="button"><X aria-hidden="true" size={18} /></button>
        <span>EXTERNAL RESOURCE</span><h2 id="external-risk-title">即将离开本站</h2><p>“{externalResource.displayName}”由外部网站提供。本站无法验证文件内容，请确认来源可信后再继续。</p>
        <dl><dt>目标网站</dt><dd>{externalResourceHost(externalResource.externalUrl ?? "")}</dd><dt>链接</dt><dd>{externalResource.externalUrl}</dd></dl>
        <footer><button className="secondary-button" onClick={() => setExternalResource(null)} type="button">取消</button><button className="primary-button" onClick={() => { window.open(externalResource.externalUrl ?? "", "_blank", "noopener,noreferrer"); if (data.viewer) void action({ action: "record_interaction" }); setExternalResource(null); }} type="button">继续访问 <ExternalLink aria-hidden="true" size={14} /></button></footer>
      </section>
    </div>}
  </div>;
}
