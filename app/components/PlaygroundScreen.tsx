"use client";

import { ArrowBigUp, ArrowUpRight, CalendarDays, Clock3, Download, Eye, MessageCircle, Paperclip, Plus, Search, SlidersHorizontal } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { PlaygroundPostCard } from "../lib/playground";
import { getCachedJson } from "../lib/client-cache";
import { fullDate, relativeTime } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { AppLink as Link } from "./AppLink";
import { MarkdownTitle } from "./MarkdownTitle";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

type PlaygroundResponse = { posts: PlaygroundPostCard[] };
type Filters = { q: string; type: "all" | "post" | "resource"; tag: string; format: string; sort: string };
type FilterKey = "type" | "tag" | "format" | "sort";
const emptyFilters: Filters = { q: "", type: "all", tag: "", format: "", sort: "latest" };

export function PlaygroundScreen() {
  const { member } = useSession();
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [posts, setPosts] = useState<PlaygroundPostCard[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [knownFormats, setKnownFormats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all" && value !== "latest") params.set(key, value); });
    if (filters.sort !== "latest") params.set("sort", filters.sort);
    const query = params.toString();
    return `/api/playground${query ? `?${query}` : ""}`;
  }, [filters]);

  const acceptPosts = useCallback((next: PlaygroundPostCard[]) => {
    setPosts(next);
    setKnownTags((current) => Array.from(new Set([...current, ...next.flatMap((post) => post.tags)])).sort((left, right) => left.localeCompare(right, "zh-CN")));
    setKnownFormats((current) => Array.from(new Set([...current, ...next.flatMap((post) => post.resourceFormats)])).sort());
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setMessage("");
    getCachedJson<PlaygroundResponse>(endpoint, { onUpdate: (data) => acceptPosts(data.posts ?? []) })
      .then((data) => acceptPosts(data.posts ?? []))
      .catch((error) => setMessage(error instanceof Error ? error.message : "读取失败"))
      .finally(() => setLoading(false));
  }, [acceptPosts, endpoint]);

  useEffect(() => load(), [load]);

  function search(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draftQuery.trim() }));
  }

  function selectFilter(key: FilterKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const groups: Array<{ key: FilterKey; label: string; clearable?: boolean; options: Array<{ value: string; label: string }> }> = [
    { key: "type", label: "类型", options: [{ value: "all", label: "全部" }, { value: "post", label: "帖子" }, { value: "resource", label: "资源" }] },
    { key: "tag", label: "标签", clearable: true, options: knownTags.slice(0, 10).map((tag) => ({ value: tag, label: tag })) },
    { key: "format", label: "格式", clearable: true, options: knownFormats.slice(0, 10).map((format) => ({ value: format, label: format })) },
    { key: "sort", label: "排序", options: [{ value: "latest", label: "最新发布" }, { value: "updated", label: "最近更新" }, { value: "comments", label: "讨论最多" }, { value: "downloads", label: "下载最多" }] },
  ];

  return <div className="site-shell">
    <SiteHeader active="playground" />
    <main className="problems-page">
      <section className="problems-heading">
        <div><h1>游乐场</h1><p>吹水，发布想法，存放并分发可复用的资源。</p></div>
        {member && <Link href="/playground/new"><Plus aria-hidden="true" size={15} />发布内容</Link>}
      </section>

      <form className="problem-search" onSubmit={search}>
        <label><span className="sr-only">搜索游乐场</span><input onChange={(event) => setDraftQuery(event.target.value)} placeholder="搜索标题、正文、作者、标签或资源名" value={draftQuery} /></label>
        <button type="submit"><Search aria-hidden="true" size={16} />搜索</button>
      </form>

      <details className="filter-panel">
        <summary><span><SlidersHorizontal aria-hidden="true" size={15} />筛选</span><span>{loading ? "读取中…" : `${posts.length} 个结果`}</span></summary>
        <div className="filter-grid">
          {groups.map((group) => <fieldset key={group.key}>
            <legend>{group.label}</legend>
            <div>{group.options.length ? group.options.map((option) => {
              const selected = filters[group.key] === option.value;
              return <label key={option.value}><input checked={selected} name={`playground-${group.key}`} onChange={() => selectFilter(group.key, option.value)} onClick={() => { if (group.clearable && selected) selectFilter(group.key, ""); }} type="radio" /><span>{option.label}</span></label>;
            }) : <span className="playground-filter-empty">暂无可选项</span>}</div>
          </fieldset>)}
        </div>
      </details>

      <p aria-live="polite" className="page-message">{message}</p>
      <section aria-busy={loading} aria-label="游乐场内容列表" className="problem-results">
        {posts.map((post) => <Link className="problem-result playground-result" href={`/playground/${post.id}`} key={post.id}>
          <div>
            <p><code>{post.resourceCount ? "资源" : "帖子"}</code>{post.isPinned && <b className="pinned-label">置顶</b>}<span>{post.tags.join(" · ") || "未标记"}</span></p>
            <h2><MarkdownTitle source={post.title} /></h2>
            <div className="result-summary">{post.summary}</div>
            <footer>
              <span><CalendarDays aria-hidden="true" size={13} />创建于 {fullDate(post.createdAt)}</span>
              <span><Clock3 aria-hidden="true" size={13} />{relativeTime(post.updatedAt)}更新</span>
              <span><MessageCircle aria-hidden="true" size={13} />{post.commentCount} 条讨论</span>
              <span><ArrowBigUp aria-hidden="true" size={13} />{post.upvotes} 次顶</span>
              <span><Eye aria-hidden="true" size={13} />{post.viewCount} 次浏览</span>
              {post.resourceCount > 0 && <span><Download aria-hidden="true" size={13} />{post.downloadCount} 次下载</span>}
            </footer>
          </div>
          <span className="result-meta-stack playground-result-meta">
            {post.resourceCount > 0 && <span className="result-status"><Paperclip aria-hidden="true" size={13} />{post.resourceCount} 个资源</span>}
            <span aria-label={`${post.interactionCount} 人互动`} className="result-avatars" title={`${post.interactionCount} 人互动`}><span aria-hidden="true" className="result-avatar-stack">{post.interactionAvatars.map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className="result-avatar" initials={person.initials} key={person.id} memberId={person.id} />)}</span><small className="result-participant-count">{post.interactionCount} 人互动</small></span>
          </span>
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>)}
        {loading && !posts.length && <div className="playground-loading">正在读取内容…</div>}
        {!loading && !posts.length && <p className="empty-state">这里还没有符合条件的内容。</p>}
      </section>
    </main>
  </div>;
}
