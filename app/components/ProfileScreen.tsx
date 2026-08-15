"use client";

import { AppLink as Link } from "./AppLink";
import { AlertCircle, ArrowUpRight, Ban, Copy, Pencil, Plus, Save, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type WheelEvent } from "react";
import { relativeTime } from "../lib/format";
import { ClientFetchError, getCachedJson, invalidateClientCache, refreshCachedJson } from "../lib/client-cache";
import { AvatarEditor } from "./AvatarEditor";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";
import { MarkdownTitle } from "./MarkdownTitle";
import { useSession } from "../hooks/useSession";
import { DailyCheckin } from "./DailyCheckin";

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
    apiEnabled: boolean;
    apiQualified: boolean;
    createdAt: string;
  };
  problems: Array<{ id: string; shortCode: string; title: string; status: string; updatedAt: string; relation: string | null; isCreator: boolean; hasInteracted: boolean; lastViewedAt: string | null }>;
  playground: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    resourceCount: number;
    isAuthor: boolean;
    hasInteracted: boolean;
    isBookmarked: boolean;
    lastInteractedAt: string | null;
    bookmarkedAt: string | null;
    lastViewedAt: string | null;
  }>;
  invitations: Array<{ code: string; createdAt: string }>;
  viewer: { id: string; isSelf: boolean };
};

const tabs = [
  { key: "all", label: "所有参与" },
  { key: "created", label: "创建的难题" },
  { key: "footprints", label: "足迹" },
  { key: "interacted", label: "互动过的难题" },
  { key: "playground-created", label: "发布的内容" },
  { key: "playground-interacted", label: "互动过的内容" },
  { key: "playground-bookmarked", label: "收藏的内容" },
] as const;

type ProfileTabKey = (typeof tabs)[number]["key"];

type ProfileListItem = {
  id: string;
  kind: "problem" | "playground";
  href: string;
  label: string;
  title: string;
  description: string;
  sortAt: string;
};

export function ProfileScreen({ memberId = "me" }: { memberId?: string }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState(false);
  const [generatingInvitation, setGeneratingInvitation] = useState(false);
  const [revokingInvitation, setRevokingInvitation] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("all");
  const [editing, setEditing] = useState(false);
  const [apiSaving, setApiSaving] = useState(false);
  const [requirementOpen, setRequirementOpen] = useState(false);
  const [form, setForm] = useState({ displayName: "", bio: "", location: "", publicEmail: "", specialties: "" });
  const { refresh: refreshSession } = useSession();

  async function load(force = false) {
    const url = `/api/members/${memberId}`;
    let next: ProfileData;
    try {
      next = force
        ? await refreshCachedJson<ProfileData>(url)
        : await getCachedJson<ProfileData>(url, { onUpdate: setData });
    } catch (error) {
      if (error instanceof ClientFetchError && error.status === 401) {
        window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      throw error;
    }
    setData(next);
    setForm({
      displayName: next.member.displayName,
      bio: next.member.bio,
      location: next.member.location,
      publicEmail: next.member.publicEmail,
      specialties: next.member.specialties.join(", "),
    });
  }

  useEffect(() => {
    setActiveTab("all");
    load().catch((error) => setMessage(error instanceof Error ? error.message : "读取失败")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const visibleItems = useMemo<ProfileListItem[]>(() => {
    if (!data) return [];
    const problemItem = (problem: ProfileData["problems"][number], description: string, sortAt = problem.updatedAt): ProfileListItem => ({
      id: problem.id,
      kind: "problem",
      href: `/problems/${problem.id}`,
      label: problem.shortCode,
      title: problem.title,
      description,
      sortAt,
    });
    const playgroundItem = (post: ProfileData["playground"][number], description: string, sortAt = post.updatedAt): ProfileListItem => ({
      id: post.id,
      kind: "playground",
      href: `/playground/${post.id}`,
      label: "游乐场",
      title: post.title,
      description: `${post.resourceCount ? "资源" : "帖子"} · ${description}`,
      sortAt,
    });

    if (activeTab === "created") return data.problems
      .filter((problem) => problem.isCreator)
      .map((problem) => problemItem(problem, `创建者 · ${problem.status} · ${relativeTime(problem.updatedAt)}更新`));
    if (activeTab === "footprints") return [
      ...data.problems.filter((problem) => problem.lastViewedAt).map((problem) => problemItem(problem, `难题 · ${relativeTime(problem.lastViewedAt!)}查看`, problem.lastViewedAt!)),
      ...data.playground.filter((post) => post.lastViewedAt).map((post) => playgroundItem(post, `${relativeTime(post.lastViewedAt!)}查看`, post.lastViewedAt!)),
    ].sort((left, right) => right.sortAt.localeCompare(left.sortAt));
    if (activeTab === "interacted") return data.problems
      .filter((problem) => problem.hasInteracted)
      .map((problem) => problemItem(problem, `互动过 · ${relativeTime(problem.updatedAt)}更新`));
    if (activeTab === "playground-created") return data.playground
      .filter((post) => post.isAuthor)
      .map((post) => playgroundItem(post, `发布者 · ${relativeTime(post.updatedAt)}更新`, post.createdAt))
      .sort((left, right) => right.sortAt.localeCompare(left.sortAt));
    if (activeTab === "playground-interacted") return data.playground
      .filter((post) => post.hasInteracted)
      .map((post) => playgroundItem(post, `互动过 · ${relativeTime(post.updatedAt)}更新`, post.lastInteractedAt ?? post.updatedAt))
      .sort((left, right) => right.sortAt.localeCompare(left.sortAt));
    if (activeTab === "playground-bookmarked") return data.playground
      .filter((post) => post.isBookmarked)
      .map((post) => playgroundItem(post, `已收藏 · ${relativeTime(post.updatedAt)}更新`, post.bookmarkedAt ?? post.updatedAt))
      .sort((left, right) => right.sortAt.localeCompare(left.sortAt));
    return data.problems
      .filter((problem) => problem.isCreator || Boolean(problem.relation))
      .map((problem) => problemItem(problem, `${problem.isCreator ? "创建者" : problem.relation === "participating" ? "参与者" : "关注者"} · ${problem.status} · ${relativeTime(problem.updatedAt)}更新`));
  }, [activeTab, data]);

  const tabCounts = useMemo<Record<ProfileTabKey, number>>(() => {
    if (!data) return { all: 0, created: 0, footprints: 0, interacted: 0, "playground-created": 0, "playground-interacted": 0, "playground-bookmarked": 0 };
    return {
      all: data.problems.filter((problem) => problem.isCreator || Boolean(problem.relation)).length,
      created: data.problems.filter((problem) => problem.isCreator).length,
      footprints: data.problems.filter((problem) => problem.lastViewedAt).length + data.playground.filter((post) => post.lastViewedAt).length,
      interacted: data.problems.filter((problem) => problem.hasInteracted).length,
      "playground-created": data.playground.filter((post) => post.isAuthor).length,
      "playground-interacted": data.playground.filter((post) => post.hasInteracted).length,
      "playground-bookmarked": data.playground.filter((post) => post.isBookmarked).length,
    };
  }, [data]);

  function scrollTabs(event: WheelEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || element.scrollWidth <= element.clientWidth) return;
    const before = element.scrollLeft;
    element.scrollLeft += event.deltaY;
    if (element.scrollLeft !== before) event.preventDefault();
  }

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End")) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0 || !buttons.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
    buttons[next].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  async function generateInvitation() {
    setInviteMessage("");
    setInviteError(false);
    setGeneratingInvitation(true);
    try {
      const response = await fetch("/api/invitations", { method: "POST" });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setInviteError(true); setInviteMessage(result.message ?? "生成失败"); return; }
      setInviteMessage("已生成新邀请码，请复制后分享。");
      invalidateClientCache(`/api/members/${memberId}`);
      await load(true);
    } finally {
      setGeneratingInvitation(false);
    }
  }

  async function revokeInvitation(code: string) {
    if (!window.confirm(`确定作废邀请码 ${code}？作废后无法恢复。`)) return;
    setInviteMessage("");
    setInviteError(false);
    setRevokingInvitation(code);
    try {
      const response = await fetch(`/api/invitations?code=${encodeURIComponent(code)}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) { setInviteError(true); setInviteMessage(result.message ?? "作废失败"); return; }
      setInviteMessage("邀请码已作废，邀请名额未扣除。");
      invalidateClientCache(`/api/members/${memberId}`);
      await load(true);
    } finally {
      setRevokingInvitation("");
    }
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
    invalidateClientCache([`/api/members/${memberId}`, "/api/session", "/api/admin/members"]);
    await load(true);
  }

  async function toggleApi() {
    if (!data?.member.apiQualified) { setRequirementOpen(true); return; }
    setApiSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/access/preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !data.member.apiEnabled }),
      });
      const result = await response.json() as { enabled?: boolean; message?: string };
      if (!response.ok) { setMessage(result.message ?? "修改 API 设置失败"); return; }
      setData((current) => current ? { ...current, member: { ...current.member, apiEnabled: Boolean(result.enabled) } } : current);
      invalidateClientCache([`/api/members/${memberId}`, "/api/session", "/api/access/"]);
      await refreshSession();
    } finally {
      setApiSaving(false);
    }
  }

  if (loading) return <div className="site-shell"><SiteHeader active="profile" /><main className="loading-page">正在读取个人资料…</main></div>;
  if (!data) return <div className="site-shell"><SiteHeader active="profile" /><main className="loading-page">{message || "成员不存在"}</main></div>;

  const canGenerateInvitation = data.member.inviteQuota > data.invitations.length;

  return (
    <div className="site-shell">
      <SiteHeader active="profile" />
      <main className="profile-page">
        <header className="profile-hero">
          <div className="profile-avatar-control"><MemberAvatar avatarUpdatedAt={data.member.avatarUpdatedAt} className="profile-avatar" initials={data.member.initials} memberId={data.member.id} />{data.viewer.isSelf && editing && <AvatarEditor onUploaded={async () => { setMessage("头像已更新"); invalidateClientCache([`/api/members/${memberId}`, "/api/session", "/api/problems", "/api/admin/"]); await load(true); }} />}</div>
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

            <DailyCheckin memberId={data.member.id} readOnly={!data.viewer.isSelf} />

            {data.viewer.isSelf && <section className="profile-api-switch"><div><h2>API</h2><p>允许本地工具通过人工审阅协同难题。</p></div><button aria-checked={data.member.apiEnabled} className={`${!data.member.apiQualified ? "unmet" : data.member.apiEnabled ? "on" : ""}`} disabled={apiSaving} onClick={() => void toggleApi()} role="switch" type="button"><span>{!data.member.apiQualified ? "未达标" : data.member.apiEnabled ? "已启用" : "已关闭"}</span>{!data.member.apiQualified ? <AlertCircle aria-hidden="true" size={18} /> : <i aria-hidden="true" />}</button></section>}

            {data.viewer.isSelf && <section className="invite-panel"><h2>可用邀请</h2><div className="invite-quota"><strong>{data.member.inviteQuota}</strong><span>个名额</span></div><p>可以同时生成多个邀请码。邀请码被使用后会从列表消失并扣除一个名额；未使用的邀请码可随时作废。</p>{Boolean(data.invitations.length) && <div className="invite-code-list">{data.invitations.map((invitation) => <div className="invite-code" key={invitation.code}><code>{invitation.code}</code><button aria-label={`复制邀请码 ${invitation.code}`} onClick={() => void navigator.clipboard.writeText(invitation.code)} type="button"><Copy aria-hidden="true" size={14} /></button><button aria-label={`作废邀请码 ${invitation.code}`} className="revoke" disabled={revokingInvitation === invitation.code} onClick={() => void revokeInvitation(invitation.code)} type="button"><Ban aria-hidden="true" size={13} /><span>{revokingInvitation === invitation.code ? "处理中" : "作废"}</span></button></div>)}</div>}<button disabled={!canGenerateInvitation || generatingInvitation} onClick={() => void generateInvitation()} type="button"><Plus aria-hidden="true" size={14} />{generatingInvitation ? "生成中…" : canGenerateInvitation ? "生成邀请码" : data.member.inviteQuota <= 0 ? "暂无邀请名额" : "邀请码数量已达名额"}</button><p className={`invite-message${inviteError ? " error" : ""}`} aria-live="polite">{inviteMessage}</p></section>}
          </aside>

          <section className="profile-problems">
            <div className="profile-tabs" onKeyDown={navigateTabs} onWheel={scrollTabs} role="tablist" tabIndex={-1}>{tabs.filter((tab) => tab.key !== "footprints" || data.viewer.isSelf).map((tab) => <button aria-controls="profile-list-panel" aria-selected={activeTab === tab.key} className={activeTab === tab.key ? "active" : ""} key={tab.key} onClick={(event) => { setActiveTab(tab.key); event.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); }} role="tab" tabIndex={activeTab === tab.key ? 0 : -1} type="button"><span>{tab.label}</span><small>{tabCounts[tab.key]}</small></button>)}</div>
            <div className="profile-problem-list" id="profile-list-panel" role="tabpanel">{visibleItems.map((item) => <Link href={item.href} key={`${item.kind}-${item.id}`}><code>{item.label}</code><div><b><MarkdownTitle source={item.title} /></b><p>{item.description}</p></div><ArrowUpRight aria-hidden="true" size={16} /></Link>)}{!visibleItems.length && <p className="empty-state">这一分类下还没有内容。</p>}</div>
          </section>
        </div>
        <p className="page-message" aria-live="polite">{message}</p>
      </main>
      {requirementOpen && <div className="api-dialog-backdrop"><section aria-labelledby="api-requirement-title" aria-modal="true" className="api-requirement-dialog" role="dialog"><button aria-label="关闭" className="api-dialog-close" onClick={() => setRequirementOpen(false)} type="button"><X aria-hidden="true" size={18} /></button><h2 id="api-requirement-title">我们始终确保您在负责任地使用 AI</h2><p>为了确保您正确高效地使用 AI 协同本站，我们需要您对本站有一定认识，并且有充足的 AI 使用需求。在此，我们需要您至少在“难题”板块参与过一次讨论。谢谢理解！</p><footer><button className="primary-button" onClick={() => setRequirementOpen(false)} type="button">知道了</button></footer></section></div>}
    </div>
  );
}
