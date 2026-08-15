"use client";

import { AppLink as Link } from "./AppLink";
import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../hooks/useSession";
import { relativeTime } from "../lib/format";
import type { ProblemCard } from "../lib/types";
import type { PlaygroundPostCard } from "../lib/playground";
import { buildHomeFeed } from "../lib/home-feed";
import { getCachedJson } from "../lib/client-cache";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownTitle } from "./MarkdownTitle";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

export function HomeScreen() {
  const { member } = useSession();
  const memberId = member?.id;
  const [problems, setProblems] = useState<ProblemCard[]>([]);
  const [playground, setPlayground] = useState<PlaygroundPostCard[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setFeedLoading(true);
    if (!memberId) setPlayground([]);
    const problemRequest = getCachedJson<{ problems?: ProblemCard[] }>("/api/problems", {
      onUpdate: (data) => { if (active) setProblems(data.problems ?? []); },
    }).then((data) => { if (active) setProblems(data.problems ?? []); });
    const playgroundRequest = memberId
      ? getCachedJson<{ posts?: PlaygroundPostCard[] }>("/api/playground", {
        onUpdate: (data) => { if (active) setPlayground(data.posts ?? []); },
      }).then((data) => { if (active) setPlayground(data.posts ?? []); })
      : Promise.resolve();
    void Promise.allSettled([problemRequest, playgroundRequest]).finally(() => {
      if (active) setFeedLoading(false);
    });
    return () => {
      active = false;
    };
  }, [memberId]);

  const feed = useMemo(() => buildHomeFeed(problems, playground, member?.createdAt), [member?.createdAt, playground, problems]);

  return (
    <div className="site-shell">
      <SiteHeader active="home" />
      <main className="landing-page">
        <section className="landing-intro">
          <h1>共同推进尚未解决的数学问题</h1>
          <p>公开问题，让不同思路可以并行发生。</p>
          <div>
            <Link className="primary-button" href="/problems"><Search aria-hidden="true" size={15} />浏览难题</Link>
            <Link className="secondary-button" href={member ? "/profile" : "/login?returnTo=%2F"}>{member ? "进入个人页" : "成员登录"}<ArrowRight aria-hidden="true" size={15} /></Link>
          </div>
        </section>

        <section className="recent-section">
          <header><h2>最近更新</h2></header>
          <div className="recent-grid">
            {feed.map((entry) => {
              if (entry.kind === "playground") {
                const post = entry.item;
                return (
                  <Link className="problem-card" href={`/playground/${post.id}`} key={`playground-${post.id}`}>
                    <span className="card-topline"><code>游乐场</code><i>{post.resourceCount ? "资源" : "帖子"}</i></span>
                    <div className="card-copy"><b><MarkdownTitle source={post.title} /></b><MarkdownContent className="card-summary" compact source={post.summary} /></div>
                    <span className="card-tags">{post.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</span>
                    <span className="card-footer"><span><Clock3 aria-hidden="true" size={13} />{relativeTime(post.updatedAt)}更新</span><span className="card-participants"><span aria-hidden="true" className="card-avatar-stack">{post.interactionAvatars.slice(0, 4).map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className="card-avatar" initials={person.initials} key={person.id} memberId={person.id} />)}</span><b>{post.interactionCount} 人互动</b></span></span>
                    <span className="card-action">查看内容<ArrowRight aria-hidden="true" size={14} /></span>
                  </Link>
                );
              }
              const problem = entry.item;
              const href = member ? `/problems/${problem.id}` : `/login?returnTo=${encodeURIComponent(`/problems/${problem.id}`)}`;
              return (
                <Link className="problem-card" href={href} key={`problem-${problem.id}`}>
                  <span className="card-topline"><code>{problem.shortCode}</code>{problem.status === "开放" && <i>开放</i>}</span>
                  <div className="card-copy"><b><MarkdownTitle source={problem.title} /></b><MarkdownContent className="card-summary" compact source={problem.summary} /></div>
                  <span className="card-tags">{problem.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</span>
                  <span className="card-footer"><span><Clock3 aria-hidden="true" size={13} />{relativeTime(problem.updatedAt)}更新</span><span className="card-participants"><span aria-hidden="true" className="card-avatar-stack">{problem.participantAvatars.map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className="card-avatar" initials={person.initials} key={person.id} memberId={person.id} />)}</span><b>{problem.participantCount} 人参与</b></span></span>
                  <span className="card-action">查看问题<ArrowRight aria-hidden="true" size={14} /></span>
                </Link>
              );
            })}
            {feedLoading && [0, 1, 2].map((item) => <div className="problem-card card-skeleton" key={item} aria-hidden="true" />)}
            {!feedLoading && !feed.length && <p className="empty-state">暂时还没有更新。</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
