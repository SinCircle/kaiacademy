import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Search, Users } from "lucide-react";
import { SiteHeader } from "./components/SiteHeader";

export const metadata: Metadata = {
  title: "首页",
};

const recentProblems = [
  {
    id: "P-0184",
    field: "数论",
    title: "平方数相邻差的素因子结构",
    summary: "研究连续平方数之差的素因子分布，并寻找可推广到更一般多项式序列的结构。",
    status: "进行中",
    difficulty: "困难",
    updatedAt: "2 小时前更新",
    people: 4,
    tags: ["平方数", "素因子"],
  },
  {
    id: "P-0172",
    field: "代数几何",
    title: "有限域上椭圆曲线的点数估计",
    summary: "尝试用初等方法收紧点数估计，并整理不同特征下仍需单独处理的边界情形。",
    status: "待推进",
    difficulty: "很困难",
    updatedAt: "昨天更新",
    people: 2,
    tags: ["有限域", "椭圆曲线"],
  },
  {
    id: "P-0165",
    field: "组合数学",
    title: "随机图中局部稀疏与整体连通性的阈值",
    summary: "比较局部稀疏约束与全局连通概率之间的关系，当前正在验证临界区间。",
    status: "讨论活跃",
    difficulty: "困难",
    updatedAt: "3 天前更新",
    people: 6,
    tags: ["随机图", "连通性"],
  },
];

export default function Home() {
  return (
    <div className="site-shell">
      <SiteHeader active="home" />
      <main className="landing-page">
        <section className="landing-intro">
          <div>
            <h1>共同推进尚未解决的数学问题</h1>
            <p>公开问题，让不同思路可以并行发生。</p>
            <div className="landing-actions">
              <Link className="primary" href="/problems"><Search aria-hidden="true" size={15} />浏览难题</Link>
              <Link href="/login">成员登录<ArrowRight aria-hidden="true" size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="recent-problems">
          <header><h2>最近的问题</h2><Link href="/problems">查看全部<ArrowRight aria-hidden="true" size={14} /></Link></header>
          <div className="recent-problem-grid">
            {recentProblems.map((problem) => (
              <Link className="recent-problem" href="/problems/split" key={problem.id}>
                <span className="recent-problem-topline">
                  <span className="recent-problem-id">{problem.id}</span>
                  <span className="recent-problem-status">{problem.status}</span>
                </span>
                <span className="recent-problem-copy">
                  <b>{problem.title}</b>
                  <small>{problem.summary}</small>
                </span>
                <span className="recent-problem-tags" aria-label="问题标签">
                  {problem.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </span>
                <span className="recent-problem-footer">
                  <span>{problem.field} · {problem.difficulty}</span>
                  <span><Clock3 aria-hidden="true" size={13} />{problem.updatedAt}</span>
                </span>
                <span className="recent-problem-action">
                  <span className="recent-people"><Users aria-hidden="true" size={14} />{problem.people} 人参与</span>
                  <span>查看问题<ArrowRight aria-hidden="true" size={15} /></span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
