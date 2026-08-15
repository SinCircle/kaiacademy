"use client";

import { AppLink as Link } from "./AppLink";
import { Archive, Eye, EyeOff, Pin, Power, Save, Search, Settings2, ShieldCheck, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "../hooks/useSession";
import type { AdminMember, AdminProblem } from "../lib/admin-types";
import type { AdminPlaygroundPost } from "../lib/playground";
import { fullDate, relativeTime } from "../lib/format";
import { ClientFetchError, getCachedJson, invalidateClientCache, refreshCachedJson } from "../lib/client-cache";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";
import { MarkdownTitle } from "./MarkdownTitle";

type Section = "problems" | "playground" | "members" | "api";

type ApiControl = {
  enabled: boolean;
  changedAt: string | null;
  changedBy: string | null;
  changedByName: string | null;
};

function stepInviteQuota(button: HTMLButtonElement, amount: number) {
  const input = button.closest(".admin-number-input")?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) return;
  if (amount < 0) input.stepDown(); else input.stepUp();
}

function AdminNav({ canManageMembers, section }: { canManageMembers: boolean; section: Section }) {
  return (
    <nav className="admin-tabs" aria-label="管理页面">
      <Link className={section === "problems" ? "active" : ""} href="/admin/problems"><ShieldCheck aria-hidden="true" size={15} />问题管理</Link>
      <Link className={section === "playground" ? "active" : ""} href="/admin/playground"><Archive aria-hidden="true" size={15} />游乐场管理</Link>
      <Link className={section === "api" ? "active" : ""} href="/admin/api"><Power aria-hidden="true" size={15} />API 管理</Link>
      {canManageMembers && <Link className={section === "members" ? "active" : ""} href="/admin/members"><Users aria-hidden="true" size={15} />人员管理</Link>}
    </nav>
  );
}

export function AdminScreen({ section }: { section: Section }) {
  const { member, loading: sessionLoading } = useSession();
  const [query, setQuery] = useState("");
  const [problems, setProblems] = useState<AdminProblem[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [playgroundPosts, setPlaygroundPosts] = useState<AdminPlaygroundPost[]>([]);
  const [apiControl, setApiControl] = useState<ApiControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load(force = false) {
    const url = section === "api" ? "/api/admin/api-control" : `/api/admin/${section}`;
    try {
      const apply = (data: { problems?: AdminProblem[]; members?: AdminMember[]; posts?: AdminPlaygroundPost[] } & Partial<ApiControl>) => {
        setProblems(data.problems ?? []);
        setMembers(data.members ?? []);
        setPlaygroundPosts(data.posts ?? []);
        if (typeof data.enabled === "boolean") setApiControl({
          enabled: data.enabled,
          changedAt: data.changedAt ?? null,
          changedBy: data.changedBy ?? null,
          changedByName: data.changedByName ?? null,
        });
      };
      const data = force
        ? await refreshCachedJson<{ problems?: AdminProblem[]; members?: AdminMember[]; posts?: AdminPlaygroundPost[] } & Partial<ApiControl>>(url)
        : await getCachedJson<{ problems?: AdminProblem[]; members?: AdminMember[]; posts?: AdminPlaygroundPost[] } & Partial<ApiControl>>(url, { onUpdate: apply });
      apply(data);
    } catch (error) {
      if (error instanceof ClientFetchError && error.status === 401) { window.location.assign(`/login?returnTo=%2Fadmin%2F${section}`); return; }
      if (error instanceof ClientFetchError && error.status === 403) { window.location.assign("/problems"); return; }
      throw error;
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    if (!member) { window.location.assign(`/login?returnTo=%2Fadmin%2F${section}`); return; }
    if (member.role !== "admin" && member.role !== "superadmin") { window.location.assign("/problems"); return; }
    if (section === "members" && member.role !== "superadmin") { window.location.assign("/admin/problems"); return; }
    load().catch((error) => setMessage(error instanceof Error ? error.message : "读取失败")).finally(() => setLoading(false));
    // The selected admin section is the complete resource identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, section, sessionLoading]);

  const visibleProblems = useMemo(() => {
    const target = query.trim().toLocaleLowerCase();
    return problems.filter((problem) => !target || [problem.shortCode, problem.title, problem.creatorName, problem.creatorEmail, problem.status]
      .some((value) => value.toLocaleLowerCase().includes(target)));
  }, [problems, query]);

  const visibleMembers = useMemo(() => {
    const target = query.trim().toLocaleLowerCase();
    return members.filter((person) => !target || [person.displayName, person.username, person.email, person.role, person.accountStatus]
      .some((value) => value.toLocaleLowerCase().includes(target)));
  }, [members, query]);

  const visiblePlaygroundPosts = useMemo(() => {
    const target = query.trim().toLocaleLowerCase();
    return playgroundPosts.filter((post) => !target || [post.title, post.authorName, post.authorEmail]
      .some((value) => value.toLocaleLowerCase().includes(target)));
  }, [playgroundPosts, query]);

  async function updateProblem(problem: AdminProblem, patch: Partial<Pick<AdminProblem, "status" | "isHidden" | "isPinned">>) {
    setMessage("");
    const response = await fetch(`/api/admin/problems/${problem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: patch.status ?? problem.status, isHidden: patch.isHidden ?? problem.isHidden, isPinned: patch.isPinned ?? problem.isPinned }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "保存失败"); return; }
    invalidateClientCache(["/api/admin/problems", "/api/problems", `/api/problems/${problem.id}`, "/api/members/", "/api/notifications"]);
    await load(true);
  }

  async function saveMember(event: FormEvent<HTMLFormElement>, person: AdminMember) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/members/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: form.get("role"),
        accountStatus: form.get("accountStatus"),
        inviteQuota: Number(form.get("inviteQuota")),
      }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "保存失败"); return; }
    invalidateClientCache(["/api/admin/members", `/api/members/${person.id}`, "/api/session"]);
    await load(true);
  }

  async function deleteProblem(problem: AdminProblem) {
    if (!window.confirm(`确认永久删除“${problem.title}”吗？该问题的全部讨论、参与关系、动态和足迹都会被删除，且无法恢复。`)) return;
    const response = await fetch(`/api/admin/problems/${problem.id}`, { method: "DELETE" });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "删除失败"); return; }
    setMessage("问题已删除");
    invalidateClientCache(["/api/admin/problems", "/api/problems", `/api/problems/${problem.id}`, "/api/members/", "/api/notifications"]);
    await load(true);
  }

  async function updatePlaygroundPost(post: AdminPlaygroundPost, patch: Partial<Pick<AdminPlaygroundPost, "isHidden" | "isPinned">>) {
    setMessage("");
    const response = await fetch(`/api/admin/playground/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isHidden: patch.isHidden ?? post.isHidden, isPinned: patch.isPinned ?? post.isPinned }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "保存失败"); return; }
    invalidateClientCache(["/api/admin/playground", "/api/playground", `/api/playground/${post.id}`, "/api/members/"]);
    await load(true);
  }

  async function deleteMember(person: AdminMember) {
    if (!window.confirm(`确认永久删除成员“${person.displayName}”吗？其创建的 ${person.createdProblemCount} 个问题、评论、账户资料和头像都会被删除，且无法恢复。`)) return;
    const response = await fetch(`/api/admin/members/${person.id}`, { method: "DELETE" });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "删除失败"); return; }
    setMessage("成员已删除");
    invalidateClientCache(["/api/admin/members", `/api/members/${person.id}`, "/api/problems", "/api/notifications"]);
    await load(true);
  }

  async function updateApiControl(enabled: boolean) {
    const prompt = enabled
      ? "确认重新开启全部外部 API 吗？现有 API Key 将立即恢复调用。"
      : "确认关闭全部外部 API 吗？网站页面和已有待处理请求不会受到影响。";
    if (!window.confirm(prompt)) return;
    setMessage("");
    const response = await fetch("/api/admin/api-control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "修改失败"); return; }
    invalidateClientCache(["/api/admin/api-control", "/api/access/dashboard"]);
    await load(true);
  }

  const heading = section === "problems" ? {
    title: "问题管理", description: "管理问题状态、置顶、公开可见性与永久删除。",
  } : section === "playground" ? {
    title: "游乐场管理", description: "管理内容的置顶与公开可见性。",
  } : section === "api" ? {
    title: "API 管理", description: "控制全站外部 API 的运行状态。",
  } : {
    title: "人员管理", description: "维护账户状态、管理员任命、邀请额度与永久删除。",
  };

  return (
    <div className="site-shell">
      <SiteHeader active="admin" />
      <main className="admin-page">
        <header className="admin-heading"><div><span>{member?.role === "superadmin" ? "超级管理员" : "管理员"}</span><h1>{heading.title}</h1><p>{heading.description}</p></div></header>
        <AdminNav canManageMembers={member?.role === "superadmin"} section={section} />
        {section !== "api" && <form className="admin-search" onSubmit={(event) => event.preventDefault()}><Search aria-hidden="true" size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder={section === "problems" ? "搜索编号、标题、创建者或状态" : section === "playground" ? "搜索标题、作者或邮箱" : "搜索昵称、用户名、邮箱或角色"} value={query} /></form>}
        {section !== "api" && <p className="form-message" aria-live="polite">{message}</p>}

        {section === "api" ? (
          <section className="admin-api-control" aria-busy={loading}>
            {message && <p className="admin-api-message" aria-live="polite">{message}</p>}
            {apiControl && <article>
              <div>
                <span className={apiControl.enabled ? "running" : "stopped"}>{apiControl.enabled ? "运行中" : "已关闭"}</span>
                <h2>外部 API</h2>
                <p>{apiControl.enabled ? "所有有效 API Key 均可正常调用。" : "所有外部调用已暂停，Key 与待处理请求均已保留。"}</p>
                {apiControl.changedAt && <small>{apiControl.changedByName ?? "管理员"} · {relativeTime(apiControl.changedAt)}操作</small>}
              </div>
              {apiControl.enabled ? (
                <button className="danger" onClick={() => void updateApiControl(false)} type="button">关闭全部 API</button>
              ) : member?.role === "superadmin" ? (
                <button className="primary" onClick={() => void updateApiControl(true)} type="button">重新开启 API</button>
              ) : (
                <p className="admin-api-reopen-note">仅超级管理员可以重新开启</p>
              )}
            </article>}
            {!loading && !apiControl && <p className="empty-state">暂时无法读取 API 状态。</p>}
          </section>
        ) : section === "problems" ? (
          <section className="admin-list" aria-busy={loading}>
            {visibleProblems.map((problem) => <article className={`admin-problem-row${problem.isHidden ? " hidden-record" : ""}`} key={problem.id}>
              <div className="admin-record-main"><span><code>{problem.shortCode}</code>{problem.isPinned && <i>置顶</i>}{problem.isHidden && <i>已隐藏</i>}</span><h2><Link href={`/problems/${problem.id}`}><MarkdownTitle source={problem.title} /></Link></h2><p>{problem.creatorName} · {problem.creatorEmail}</p></div>
              <div className="admin-record-stats"><span>{problem.participantCount} 人参与</span><span>{problem.messageCount} 条讨论</span><time>{relativeTime(problem.updatedAt)}更新</time></div>
              <label><span>状态</span><select aria-label={`${problem.title}的状态`} onChange={(event) => void updateProblem(problem, { status: event.target.value })} value={problem.status}><option>开放</option><option>已解决</option></select></label>
              <div className="admin-row-actions"><Link href={`/problems/${problem.id}/settings`}><Settings2 aria-hidden="true" size={14} />设置</Link><button onClick={() => void updateProblem(problem, { isPinned: !problem.isPinned })} type="button"><Pin aria-hidden="true" size={14} />{problem.isPinned ? "取消置顶" : "置顶"}</button><button onClick={() => void updateProblem(problem, { isHidden: !problem.isHidden })} type="button">{problem.isHidden ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}{problem.isHidden ? "恢复" : "隐藏"}</button><button className="danger" onClick={() => void deleteProblem(problem)} type="button"><Trash2 aria-hidden="true" size={14} />删除</button></div>
            </article>)}
            {!loading && !visibleProblems.length && <p className="empty-state">没有匹配的问题。</p>}
          </section>
        ) : section === "playground" ? (
          <section className="admin-list" aria-busy={loading}>
            {visiblePlaygroundPosts.map((post) => <article className={`admin-playground-row${post.isHidden ? " hidden-record" : ""}`} key={post.id}>
              <div className="admin-record-main"><span>{post.isPinned && <i>置顶</i>}{post.isHidden && <i>已隐藏</i>}</span><h2><Link href={`/playground/${post.id}`}><MarkdownTitle source={post.title} /></Link></h2><p>{post.authorName} · {post.authorEmail}</p></div>
              <div className="admin-record-stats"><span>{post.resourceCount} 个资源</span><span>{post.commentCount} 条讨论</span><span>{post.downloadCount} 次下载</span><time>{relativeTime(post.updatedAt)}更新</time></div>
              <div className="admin-row-actions"><button onClick={() => void updatePlaygroundPost(post, { isPinned: !post.isPinned })} type="button"><Pin aria-hidden="true" size={14} />{post.isPinned ? "取消置顶" : "置顶"}</button><button onClick={() => void updatePlaygroundPost(post, { isHidden: !post.isHidden })} type="button">{post.isHidden ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}{post.isHidden ? "恢复" : "隐藏"}</button></div>
            </article>)}
            {!loading && !visiblePlaygroundPosts.length && <p className="empty-state">没有匹配的游乐场内容。</p>}
          </section>
        ) : (
          <section className="admin-list" aria-busy={loading}>
            {visibleMembers.map((person) => <form className={`admin-member-row${person.accountStatus === "suspended" ? " suspended-record" : ""}`} key={person.id} onSubmit={(event) => void saveMember(event, person)}>
              <div className="admin-person"><MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} initials={person.initials} memberId={person.id} /><div><h2><Link href={`/members/${person.id}`}>{person.displayName}</Link></h2><p>@{person.username} · {person.email}</p><small>注册于 {fullDate(person.createdAt)}</small></div></div>
              <div className="admin-record-stats"><span>{person.createdProblemCount} 个创建</span><span>{person.participatingCount} 个参与</span><span>{person.messageCount} 条讨论</span></div>
              <label><span>角色</span><select defaultValue={person.role} disabled={person.role === "superadmin"} name="role">{person.role === "superadmin" && <option value="superadmin">超级管理员</option>}<option value="member">普通成员</option><option value="admin">管理员</option></select>{person.role === "superadmin" && <input name="role" type="hidden" value="superadmin" />}</label>
              <label><span>账户</span><select defaultValue={person.accountStatus} disabled={person.id === member?.id} name="accountStatus"><option value="active">启用</option><option value="suspended">停用</option></select>{person.id === member?.id && <input name="accountStatus" type="hidden" value={person.accountStatus} />}</label>
              <label><span>邀请额度</span><span className="admin-number-input"><button aria-label="减少邀请额度" onClick={(event) => stepInviteQuota(event.currentTarget, -1)} type="button">−</button><input defaultValue={person.inviteQuota} max={10000} min={0} name="inviteQuota" type="number" /><button aria-label="增加邀请额度" onClick={(event) => stepInviteQuota(event.currentTarget, 1)} type="button">+</button></span></label>
              <div className="admin-row-actions"><button className="primary" type="submit"><Save aria-hidden="true" size={14} />保存</button>{person.role !== "superadmin" && <button className="danger" onClick={() => void deleteMember(person)} type="button"><Trash2 aria-hidden="true" size={14} />删除</button>}</div>
            </form>)}
            {!loading && !visibleMembers.length && <p className="empty-state">没有匹配的成员。</p>}
          </section>
        )}
      </main>
    </div>
  );
}
