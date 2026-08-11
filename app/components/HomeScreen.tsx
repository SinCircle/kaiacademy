"use client";

import Link from "next/link";
import { ArrowRight, Clock3, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "../hooks/useSession";
import { relativeTime } from "../lib/format";
import type { ProblemCard } from "../lib/types";
import { MarkdownContent } from "./MarkdownContent";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

export function HomeScreen() {
  const { member } = useSession();
  const [problems, setProblems] = useState<ProblemCard[]>([]);

  useEffect(() => {
    fetch("/api/problems")
      .then((response) => response.json() as Promise<{ problems?: ProblemCard[] }>)
      .then((data) => setProblems((data.problems ?? []).slice(0, 3)))
      .catch(() => undefined);
  }, []);

  return (
    <div className="site-shell">
      <SiteHeader active="home" />
      <main className="landing-page">
        <section className="landing-intro">
          <h1>共同推进尚未解决的数学问题</h1>
          <p>公开问题，让不同思路可以并行发生。</p>
          <div>
            <Link className="primary-button" href="/problems"><Search aria-hidden="true" size={15} />浏览难题</Link>
            <Link className="secondary-button" href={member ? "/profile" : "/login"}>{member ? "进入个人页" : "成员登录"}<ArrowRight aria-hidden="true" size={15} /></Link>
          </div>
        </section>

        <section className="recent-section">
          <header><h2>最近的问题</h2><Link href="/problems">查看全部<ArrowRight aria-hidden="true" size={14} /></Link></header>
          <div className="recent-grid">
            {problems.map((problem) => {
              const href = member ? `/problems/${problem.id}` : `/login?returnTo=${encodeURIComponent(`/problems/${problem.id}`)}`;
              return (
                <Link className="problem-card" href={href} key={problem.id}>
                  <span className="card-topline"><code>{problem.shortCode}</code>{problem.status === "开放" && <i>开放</i>}</span>
                  <div className="card-copy"><b>{problem.title}</b><MarkdownContent className="card-summary" compact source={problem.summary} /></div>
                  <span className="card-tags">{problem.tags.slice(0, 3).map((tag) => <i key={tag}>{tag}</i>)}</span>
                  <span className="card-footer"><span><Clock3 aria-hidden="true" size={13} />{relativeTime(problem.updatedAt)}更新</span><span className="card-participants"><span aria-hidden="true" className="card-avatar-stack">{problem.participantAvatars.map((person) => <MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} className="card-avatar" initials={person.initials} key={person.id} memberId={person.id} />)}</span><b>{problem.participantCount} 人参与</b></span></span>
                  <span className="card-action">查看问题<ArrowRight aria-hidden="true" size={14} /></span>
                </Link>
              );
            })}
            {!problems.length && [0, 1, 2].map((item) => <div className="problem-card card-skeleton" key={item} aria-hidden="true" />)}
          </div>
        </section>
      </main>
    </div>
  );
}
