import type { Metadata } from "next";
import { Copy, Pencil, Plus } from "lucide-react";
import { ProfileProblemTabs, type ProfileProblem } from "../components/ProfileProblemTabs";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "个人主页",
};

const activeProblems: ProfileProblem[] = [
  { id: "P-0184", title: "平方数相邻差的素因子结构", detail: "8 月 9 日加入 · 2 小时前有推进" },
  { id: "P-0139", title: "算术级数中最小素数的界", detail: "7 月 27 日加入 · 昨天有推进" },
];

const createdProblems: ProfileProblem[] = [
  { id: "P-0176", title: "短区间内素数间隔的初等估计", detail: "进行中 · 3 位参与者" },
  { id: "P-0121", title: "一类二次型的整点表示问题", detail: "已解决 · 2 条采纳解答" },
  { id: "P-0094", title: "互素序列中的密度下界", detail: "已搁置 · 最后推进于 6 月 18 日" },
];

const allProblems: ProfileProblem[] = [
  { id: "P-0184", title: "平方数相邻差的素因子结构", detail: "参与者 · 进行中" },
  { id: "P-0139", title: "算术级数中最小素数的界", detail: "参与者 · 进行中" },
  { id: "P-0108", title: "平方和表示的局部条件", detail: "参与者 · 已完成" },
  { id: "P-0077", title: "连分数周期长度的上界", detail: "管理者 · 已归档" },
];

const problemGroups = [
  { key: "active", label: "正在参与", items: activeProblems },
  { key: "created", label: "创建的问题", items: createdProblems },
  { key: "all", label: "所有参与", items: allProblems },
];

export default function ProfilePage() {
  return (
    <div className="site-shell">
      <SiteHeader active="profile" />
      <main className="profile-page">
        <header className="profile-hero">
          <div className="profile-avatar">XW</div>
          <div className="profile-identity">
            <p>成员 · 2025 年加入</p>
            <h1>许闻</h1>
            <span>解析数论 / 初等数论</span>
          </div>
          <button type="button"><Pencil aria-hidden="true" size={13} />编辑资料</button>
        </header>

        <div className="profile-content">
          <aside className="profile-side">
            <section className="profile-bio">
              <h2>简介</h2>
              <p>数论研究者，关注素数分布与丢番图方程中的初等方法。希望把复杂证明拆成可以独立验证的小步骤，也欢迎不同方法并行推进同一个问题。</p>
              <div className="profile-tags"><span>解析数论</span><span>初等数论</span><span>丢番图方程</span></div>
              <dl>
                <div><dt>所在地</dt><dd>上海</dd></div>
                <div><dt>公开邮箱</dt><dd>xuwen@example.org</dd></div>
              </dl>
            </section>

            <section className="profile-invites">
              <h2>可用邀请</h2>
              <div className="invite-count"><strong>3</strong><span>个名额</span></div>
              <p>累计邀请 9 人。邀请码使用后即失效。</p>
              <div className="invite-code"><code>MATH-DEMO</code><button type="button" aria-label="复制邀请码"><Copy aria-hidden="true" size={14} /></button></div>
              <button className="new-invite" type="button"><Plus aria-hidden="true" size={14} />生成邀请码</button>
            </section>
          </aside>

          <div className="profile-main">
            <ProfileProblemTabs groups={problemGroups} />
          </div>
        </div>
      </main>
    </div>
  );
}
