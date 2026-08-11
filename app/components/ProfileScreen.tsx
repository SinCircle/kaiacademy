"use client";

import Link from "next/link";
import { ArrowUpRight, Copy, Pencil, Plus, Save, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { relativeTime } from "../lib/format";
import { AvatarEditor } from "./AvatarEditor";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

type ProfileData = {
  member: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    initials: string;
    avatarUpdatedAt: string | null;
    bio: string;
    location: string;
    publicEmail: string;
    specialties: string[];
    role: "member" | "admin" | "superadmin";
    inviteQuota: number;
    createdAt: string;
  };
  problems: Array<{ id: string; shortCode: string; title: string; status: string; updatedAt: string; relation: string | null; isCreator: boolean; hasInteracted: boolean; lastViewedAt: string | null }>;
  invitations: Array<{ code: string; createdAt: string; usedAt: string | null }>;
  viewer: { id: string; isSelf: boolean; canEditQuota: boolean };
};

const tabs = [
  { key: "all", label: "所有参与" },
  { key: "created", label: "创建的问题" },
  { key: "footprints", label: "足迹" },
  { key: "interacted", label: "互动过的问题" },
] as const;

export function ProfileScreen({ memberId = "me" }: { memberId?: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState(false);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("all");
  const [editing, setEditing] = useState(false);
  const [quota, setQuota] = useState("0");
  const [form, setForm] = useState({ displayName: "", bio: "", location: "", publicEmail: "", specialties: "" });

  async function load() {
    const response = await fetch(`/api/members/${memberId}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`); return; }
    const next = await response.json() as ProfileData & { message?: string };
    if (!response.ok) throw new Error(next.message ?? "读取失败");
    setData(next);
    setQuota(String(next.member.inviteQuota));
    setForm({
      displayName: next.member.displayName,
      bio: next.member.bio,
      location: next.member.location,
      publicEmail: next.member.publicEmail,
      specialties: next.member.specialties.join(", "),
    });
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "读取失败")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const visibleProblems = useMemo(() => {
    if (!data) return [];
    if (activeTab === "created") return data.problems.filter((problem) => problem.isCreator);
    if (activeTab === "footprints") return data.problems.filter((problem) => problem.lastViewedAt).sort((left, right) => (right.lastViewedAt ?? "").localeCompare(left.lastViewedAt ?? ""));
    if (activeTab === "interacted") return data.problems.filter((problem) => problem.hasInteracted);
    return data.problems.filter((problem) => problem.isCreator || Boolean(problem.relation));
  }, [activeTab, data]);

  async function saveQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/members/${data?.member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteQuota: Number(quota) }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "修改失败"); return; }
    setMessage("邀请额度已更新");
    await load();
  }

  async function generateInvitation() {
    setInviteMessage("");
    setInviteError(false);
    const response = await fetch("/api/invitations", { method: "POST" });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setInviteError(true); setInviteMessage(result.message ?? "生成失败"); return; }
    setInviteMessage("已生成新邀请码，请复制后分享。");
    await load();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/members/${data?.member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "profile", ...form, specialties: form.specialties.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }),
    });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "保存失败"); return; }
    setEditing(false);
    setMessage("个人资料已保存");
    await load();
  }

  if (loading) return <div className="site-shell"><SiteHeader active="profile" /><main className="loading-page">正在读取个人资料…</main></div>;
  if (!data) return <div className="site-shell"><SiteHeader active="profile" /><main className="loading-page">{message || "成员不存在"}</main></div>;

  const currentCode = data.invitations.find((invitation) => !invitation.usedAt);

  return (
    <div className="site-shell">
      <SiteHeader active="profile" />
      <main className="profile-page">
        <header className="profile-hero">
          <div className="profile-avatar-control"><MemberAvatar avatarUpdatedAt={data.member.avatarUpdatedAt} className="profile-avatar" initials={data.member.initials} memberId={data.member.id} />{data.viewer.isSelf && editing && <AvatarEditor onUploaded={async () => { setMessage("头像已更新"); await load(); }} />}</div>
          <div><p>{data.member.role === "superadmin" ? "超级管理员" : data.member.role === "admin" ? "管理员" : "成员"} · {new Date(data.member.createdAt).getFullYear()} 年加入</p><h1>{data.member.displayName}</h1><span>{data.member.specialties.join(" / ") || "尚未填写专业领域"}</span></div>
          {data.viewer.isSelf && <button onClick={() => setEditing((value) => !value)} type="button"><Pencil aria-hidden="true" size={13} />{editing ? "取消编辑" : "编辑资料"}</button>}
        </header>

        {editing && <form className="profile-editor" onSubmit={saveProfile}>
          <label><span>显示名称</span><input onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} value={form.displayName} /></label>
          <label className="wide"><span>简介</span><textarea onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} rows={4} value={form.bio} /></label>
          <label><span>所在地</span><input onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} value={form.location} /></label>
          <label><span>公开邮箱</span><input onChange={(event) => setForm((current) => ({ ...current, publicEmail: event.target.value }))} type="email" value={form.publicEmail} /></label>
          <label className="wide"><span>专业标签（用逗号分隔）</span><input onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))} value={form.specialties} /></label>
          <button className="primary-button" type="submit"><Save aria-hidden="true" size={14} />保存资料</button>
        </form>}

        <div className="profile-layout">
          <aside>
            <section className="profile-bio"><h2>简介</h2><p>{data.member.bio || "暂未填写简介。"}</p><div>{data.member.specialties.map((tag) => <span key={tag}>{tag}</span>)}</div><dl><div><dt>所在地</dt><dd>{data.member.location || "未公开"}</dd></div><div><dt>公开邮箱</dt><dd>{data.member.publicEmail || "未公开"}</dd></div><div><dt>用户名</dt><dd>@{data.member.username}</dd></div></dl></section>

            {data.viewer.isSelf && <section className="invite-panel"><h2>可用邀请</h2><div><strong>{data.member.inviteQuota}</strong><span>个名额</span></div><p>邀请码一次性使用；现有邀请码被使用后才能再次生成。</p>{currentCode && <div className="invite-code"><code>{currentCode.code}</code><button aria-label="复制邀请码" onClick={() => void navigator.clipboard.writeText(currentCode.code)} type="button"><Copy aria-hidden="true" size={14} /></button></div>}<button disabled={Boolean(currentCode) || data.member.inviteQuota <= 0} onClick={() => void generateInvitation()} type="button"><Plus aria-hidden="true" size={14} />{currentCode ? "等待邀请码被使用" : "生成邀请码"}</button><p className={`invite-message${inviteError ? " error" : ""}`} aria-live="polite">{inviteMessage}</p></section>}

            {data.viewer.canEditQuota && <section className="quota-panel"><h2><ShieldCheck aria-hidden="true" size={15} />超级管理员</h2><p>修改该成员可生成的邀请码数量。</p><form onSubmit={saveQuota}><input min={0} onChange={(event) => setQuota(event.target.value)} type="number" value={quota} /><button type="submit">保存额度</button></form></section>}
          </aside>

          <section className="profile-problems">
            <div className="profile-tabs" role="tablist">{tabs.filter((tab) => tab.key !== "footprints" || data.viewer.isSelf).map((tab) => {
              const count = tab.key === "created"
                ? data.problems.filter((problem) => problem.isCreator).length
                : tab.key === "footprints"
                    ? data.problems.filter((problem) => problem.lastViewedAt).length
                    : tab.key === "interacted"
                      ? data.problems.filter((problem) => problem.hasInteracted).length
                      : data.problems.filter((problem) => problem.isCreator || Boolean(problem.relation)).length;
              return <button aria-selected={activeTab === tab.key} className={activeTab === tab.key ? "active" : ""} key={tab.key} onClick={() => setActiveTab(tab.key)} role="tab" type="button"><span>{tab.label}</span><small>{count}</small></button>;
            })}</div>
            <div className="profile-problem-list" role="tabpanel">{visibleProblems.map((problem) => <Link href={`/problems/${problem.id}`} key={problem.id}><code>{problem.shortCode}</code><div><b>{problem.title}</b><p>{activeTab === "footprints" && problem.lastViewedAt ? `${relativeTime(problem.lastViewedAt)}查看` : activeTab === "interacted" ? `互动过 · ${relativeTime(problem.updatedAt)}更新` : `${problem.isCreator ? "创建者" : problem.relation === "participating" ? "参与者" : "关注者"} · ${problem.status} · ${relativeTime(problem.updatedAt)}更新`}</p></div><ArrowUpRight aria-hidden="true" size={16} /></Link>)}{!visibleProblems.length && <p className="empty-state">这一分类下还没有问题。</p>}</div>
          </section>
        </div>
        <p className="page-message" aria-live="polite">{message}</p>
      </main>
    </div>
  );
}
