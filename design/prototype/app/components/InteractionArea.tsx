"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowBigUp,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleX,
  FileCheck2,
  Lightbulb,
  MoreHorizontal,
  Reply,
} from "lucide-react";
import { DiscussionComposer } from "./DiscussionComposer";
import { MarkdownContent } from "./MarkdownContent";

const REPLIES_PER_PAGE = 50;

type DiscussionComment = {
  id: string;
  initials: string;
  name: string;
  time: string;
  body: string;
  upvotes: number;
  label?: "解法" | "见解" | "反例";
  adopted?: boolean;
  replies: DiscussionComment[];
};

const initialComments: DiscussionComment[] = [
  {
    id: "comment-chen-yu",
    initials: "CY",
    name: "陈屿",
    time: "今天 10:24",
    body: "我先按 n 的奇偶性拆开处理。奇数情形里两个因子都是偶数，直接使用互素性时需要先除去公共的 2。",
    upvotes: 12,
    label: "解法",
    adopted: true,
    replies: [
      {
        id: "comment-zhou-lan",
        initials: "ZL",
        name: "周岚",
        time: "今天 11:08",
        body: "同意。还可以先固定一个素数 p，比较 n − 1 与 n + 1 的 p-adic 估值，这样边界条件会更清楚。",
        upvotes: 8,
        label: "见解",
        replies: [
          {
            id: "comment-fang-li",
            initials: "FL",
            name: "方理",
            time: "今天 11:19",
            body: "这里把 p = 2 单独列出即可。对奇素数，两个相邻因子的估值不会同时为正。",
            upvotes: 5,
            replies: [
              {
                id: "comment-chen-yu-follow-up",
                initials: "CY",
                name: "陈屿",
                time: "今天 11:26",
                body: "好，我会把 2-adic 的情形写成一个单独的小引理。",
                upvotes: 2,
                replies: [],
              },
            ],
          },
        ],
      },
      {
        id: "comment-song-xu",
        initials: "SX",
        name: "宋叙",
        time: "今天 11:14",
        body: "我可以补一组数值实验，先看常数 C 在小范围内的表现。",
        upvotes: 3,
        replies: [],
      },
    ],
  },
  {
    id: "comment-xu-wen",
    initials: "XW",
    name: "许闻",
    time: "今天 11:32",
    body: "先保留这两条路线。若能把常数 C 与奇偶性无关地统一起来，就可以整理成一个独立引理。",
    upvotes: 9,
    label: "见解",
    replies: [
      {
        id: "comment-lin-cheng",
        initials: "LC",
        name: "林澄",
        time: "今天 11:41",
        body: "我来检查一下统一常数时是否需要额外使用大筛结论。",
        upvotes: 4,
        replies: [],
      },
    ],
  },
];

function sortByUpvotes(comments: DiscussionComment[]) {
  return [...comments].sort((left, right) => Number(Boolean(right.adopted)) - Number(Boolean(left.adopted)) || right.upvotes - left.upvotes);
}

function countComments(comments: DiscussionComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );
}

function findComment(comments: DiscussionComment[], commentId: string): DiscussionComment | undefined {
  for (const comment of comments) {
    if (comment.id === commentId) return comment;
    const nested = findComment(comment.replies, commentId);
    if (nested) return nested;
  }
}

function updateComment(
  comments: DiscussionComment[],
  commentId: string,
  updater: (comment: DiscussionComment) => DiscussionComment,
): DiscussionComment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) return updater(comment);

    return {
      ...comment,
      replies: updateComment(comment.replies, commentId, updater),
    };
  });
}

function createCurrentUserComment(body: string): DiscussionComment {
  return {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    initials: "XW",
    name: "许闻",
    time: "刚刚",
    body,
    upvotes: 0,
    adopted: false,
    replies: [],
  };
}

function InlineReplyComposer({
  authorName,
  onCancel,
  onSubmit,
}: {
  authorName: string;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const isExpanded = isFocused || body.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    onSubmit(trimmedBody);
    setBody("");
  }

  return (
    <form
      className={`inline-reply-composer${isExpanded ? " is-expanded" : ""}`}
      onSubmit={handleSubmit}
    >
      <label>
        <span className="sr-only">回复 {authorName}</span>
        <textarea
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder={`回复 ${authorName}`}
          rows={isExpanded ? 2 : 1}
          value={body}
        />
      </label>
      <div>
        <button className="reply-cancel-button" onClick={onCancel} type="button">取消</button>
        <button className="reply-submit-button" disabled={!body.trim()} type="submit">回复</button>
      </div>
    </form>
  );
}

function CommentThread({
  comment,
  isCreator,
  onAdopt,
  onReply,
  onSetLabel,
  onUpvote,
  upvotedCommentIds,
}: {
  comment: DiscussionComment;
  isCreator: boolean;
  onAdopt: (commentId: string) => void;
  onReply: (parentId: string, body: string) => void;
  onSetLabel: (commentId: string, label: DiscussionComment["label"]) => void;
  onUpvote: (commentId: string) => void;
  upvotedCommentIds: ReadonlySet<string>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [visibleReplyCount, setVisibleReplyCount] = useState(REPLIES_PER_PAGE);
  const sortedReplies = sortByUpvotes(comment.replies);
  const visibleReplies = sortedReplies.slice(0, visibleReplyCount);
  const hiddenReplyCount = Math.max(0, sortedReplies.length - visibleReplyCount);
  const replyListId = `replies-${comment.id}`;
  const isUpvoted = upvotedCommentIds.has(comment.id);
  const isOwn = comment.name === "许闻";

  function collapseReplies() {
    setIsExpanded(false);
    setVisibleReplyCount(REPLIES_PER_PAGE);
  }

  function submitReply(body: string) {
    onReply(comment.id, body);
    setIsReplying(false);
    setIsExpanded(true);
  }

  return (
    <div className={`comment-thread${isExpanded ? " has-expanded-replies" : ""}`} role="listitem">
      <article className="discussion-comment">
        <span className="comment-avatar">{comment.initials}</span>
        <div className="comment-main">
          <header>
            <b>{comment.name}</b><span>{comment.time}</span>
            {comment.label && <em className="comment-label">{comment.label}</em>}
            {comment.adopted && <BadgeCheck aria-label="创建者已采纳" className="comment-adopted" size={14} />}
          </header>
          <MarkdownContent className="comment-markdown" source={comment.body} />
          <div className="comment-actions">
            <button
              aria-expanded={isReplying}
              onClick={() => setIsReplying((current) => !current)}
              type="button"
            >
              <Reply aria-hidden="true" size={13} />回复
            </button>
            <button
              aria-label={`${isUpvoted ? "取消顶" : "顶"}，当前 ${comment.upvotes} 个顶`}
              aria-pressed={isUpvoted}
              className={`upvote-button ${isUpvoted ? "is-active" : ""}`}
              onClick={() => onUpvote(comment.id)}
              type="button"
            >
              <ArrowBigUp aria-hidden="true" size={13} />
              <span>顶</span>
              <strong>{comment.upvotes}</strong>
            </button>
            {comment.replies.length > 0 && (
              <button
                aria-controls={replyListId}
                aria-expanded={isExpanded}
                className="reply-toggle-button"
                onClick={() => (isExpanded ? collapseReplies() : setIsExpanded(true))}
                type="button"
              >
                {isExpanded
                  ? <ChevronDown aria-hidden="true" size={13} />
                  : <ChevronRight aria-hidden="true" size={13} />}
                {isExpanded ? "收起回复" : `展开回复（${comment.replies.length}）`}
              </button>
            )}
          </div>
        </div>
        <button className="more-button" onClick={() => setIsMenuOpen((current) => !current)} type="button" aria-label={`更多关于 ${comment.name} 的操作`}>
          <MoreHorizontal aria-hidden="true" size={15} />
        </button>
        {isMenuOpen && (
          <div className="comment-menu">
            {isOwn && (
              <>
                <button onClick={() => { onSetLabel(comment.id, "解法"); setIsMenuOpen(false); }} type="button"><FileCheck2 aria-hidden="true" size={14} />解法</button>
                <button onClick={() => { onSetLabel(comment.id, "见解"); setIsMenuOpen(false); }} type="button"><Lightbulb aria-hidden="true" size={14} />见解</button>
                <button onClick={() => { onSetLabel(comment.id, "反例"); setIsMenuOpen(false); }} type="button"><CircleX aria-hidden="true" size={14} />反例</button>
              </>
            )}
            {isCreator && <button onClick={() => { onAdopt(comment.id); setIsMenuOpen(false); }} type="button"><BadgeCheck aria-hidden="true" size={14} />{comment.adopted ? "取消采纳" : "采纳消息"}</button>}
          </div>
        )}
      </article>

      {isReplying && (
        <InlineReplyComposer
          authorName={comment.name}
          onCancel={() => setIsReplying(false)}
          onSubmit={submitReply}
        />
      )}

      {isExpanded && (
        <div className="comment-children" id={replyListId} role="list">
          {visibleReplies.map((reply) => (
            <CommentThread
              comment={reply}
              isCreator={isCreator}
              key={reply.id}
              onAdopt={onAdopt}
              onReply={onReply}
              onSetLabel={onSetLabel}
              onUpvote={onUpvote}
              upvotedCommentIds={upvotedCommentIds}
            />
          ))}
          {hiddenReplyCount > 0 && (
            <button
              className="load-more-replies"
              onClick={() => setVisibleReplyCount((count) => count + REPLIES_PER_PAGE)}
              type="button"
            >
              展开更多（还有 {hiddenReplyCount} 条）
              <ChevronDown aria-hidden="true" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InteractionArea({ onAdoptionChange }: { onAdoptionChange?: (name: string, adopted: boolean) => void }) {
  const [comments, setComments] = useState(initialComments);
  const [upvotedCommentIds, setUpvotedCommentIds] = useState<Set<string>>(() => new Set());
  const sortedComments = sortByUpvotes(comments);
  const totalCommentCount = countComments(comments);

  function addTopLevelComment(body: string) {
    setComments((current) => [...current, createCurrentUserComment(body)]);
  }

  function addReply(parentId: string, body: string) {
    const reply = createCurrentUserComment(body);
    setComments((current) => updateComment(current, parentId, (comment) => ({
      ...comment,
      replies: [...comment.replies, reply],
    })));
  }

  function toggleUpvote(commentId: string) {
    const shouldRemoveUpvote = upvotedCommentIds.has(commentId);

    setUpvotedCommentIds((current) => {
      const next = new Set(current);
      if (shouldRemoveUpvote) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    setComments((current) => updateComment(current, commentId, (comment) => ({
      ...comment,
      upvotes: Math.max(0, comment.upvotes + (shouldRemoveUpvote ? -1 : 1)),
    })));
  }

  function setCommentLabel(commentId: string, label: DiscussionComment["label"]) {
    setComments((current) => updateComment(current, commentId, (comment) => ({ ...comment, label })));
  }

  function toggleAdopted(commentId: string) {
    const target = findComment(comments, commentId);
    if (!target) return;
    const nextAdopted = !target.adopted;
    setComments((current) => updateComment(current, commentId, (comment) => ({ ...comment, adopted: nextAdopted })));
    onAdoptionChange?.(target.name, nextAdopted);
  }

  return (
    <section className="interaction-area">
      <div className="linear-discussion">
        <header className="discussion-heading">
          <h2>讨论</h2>
          <span>{comments.length} 条顶层讨论 · 共 {totalCommentCount} 条消息</span>
        </header>
        <DiscussionComposer
          ariaLabel="参与讨论"
          onSubmit={addTopLevelComment}
          placeholder="补充解法、见解或反例；支持 Markdown 与数学公式"
        />
        <div className="comment-list" role="list">
          {sortedComments.map((comment) => (
            <CommentThread
              comment={comment}
              isCreator
              key={comment.id}
              onAdopt={toggleAdopted}
              onReply={addReply}
              onSetLabel={setCommentLabel}
              onUpvote={toggleUpvote}
              upvotedCommentIds={upvotedCommentIds}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
