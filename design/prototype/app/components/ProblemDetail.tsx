"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { InteractionArea } from "./InteractionArea";
import { ParticipantPanel } from "./ParticipantPanel";
import { ProblemActions } from "./ProblemActions";
import { SiteHeader } from "./SiteHeader";

export function ProblemDetail() {
  const [acceptedNames, setAcceptedNames] = useState<Set<string>>(() => new Set(["陈屿"]));

  function updateAcceptedParticipant(name: string, accepted: boolean) {
    setAcceptedNames((current) => {
      const next = new Set(current);
      if (accepted) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="problem-page problem-split">
        <article className="problem-layout">
          <header className="issue-title">
            <Link className="problem-back" href="/problems"><ArrowLeft aria-hidden="true" size={14} />返回难题</Link>
            <div className="issue-meta">
              <span className="issue-id">P-0184</span>
              <span>数论 · 素数 · 整除性</span>
            </div>
            <h1>平方数相邻差的素因子结构</h1>
            <p className="issue-byline">许闻提出 · 2026 年 8 月 3 日</p>
          </header>

          <section className="problem-description">
            <div className="description-body">
              <p>
                设 <em>n &gt; 1</em> 为整数。研究相邻两个平方数之差中出现的素因子，
                并证明下述命题。
              </p>
              <div className="display-formula" aria-label="n 的平方减一等于 n 减一乘以 n 加一">
                n² − 1 = (n − 1)(n + 1)
              </div>
              <p>
                是否存在绝对常数 <em>C</em>，使得对任意充分大的 <em>n</em>，
                <em>n² − 1</em> 至少含有一个大于 <em>C · log n</em> 的素因子？
              </p>
              <p>
                允许使用初等解析数论中的标准结论；若使用更强结果，需明确指出依赖。
              </p>
            </div>
            <ProblemActions />
            <InteractionArea onAdoptionChange={updateAcceptedParticipant} />
          </section>

          <aside className="participants-section">
            <ParticipantPanel acceptedNames={acceptedNames} />
          </aside>
        </article>
      </main>
    </div>
  );
}
