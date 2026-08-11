"use client";

import Link from "next/link";
import { Eye, EyeOff, Pin, Save, Search, ShieldCheck, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "../hooks/useSession";
import type { AdminMember, AdminProblem } from "../lib/admin-types";
import { fullDate, relativeTime } from "../lib/format";
import { MemberAvatar } from "./MemberAvatar";
import { SiteHeader } from "./SiteHeader";

type Section = "problems" | "members";

function AdminNav({ canManageMembers, section }: { canManageMembers: boolean; section: Section }) {
  return (
    <nav className="admin-tabs" aria-label="管理页面">
      <Link className={section === "problems" ? "active" : ""} href="/admin/problems"><ShieldCheck aria-hidden="true" size={15} />问题管理</Link>
      {canManageMembers && <Link className={section === "members" ? "active" : ""} href="/admin/members"><Users aria-hidden="true" size={15} />人员管理</Link>}
    </nav>
  );
}

export function AdminScreen({ section }: { section: Section }) {
  const { member, loading: sessionLoading } = useSession();
  const [query, setQuery] = useState("");
  const [problems, setProblems] = useState<AdminProblem[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/admin/${section}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign(`/login?returnTo=%2Fadmin%2F${section}`); return; }
    if (response.status === 403) { window.location.assign("/problems"); return; }
    const data = await response.json() as { problems?: AdminProblem[]; members?: AdminMember[]; message?: string };
    if (!response.ok) throw new Error(data.message ?? "读取失败");
    setProblems(data.problems ?? []);
    setMembers(data.members ?? []);
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

  async function updateProblem(problem: AdminProblem, patch: Partial<Pick<AdminProblem, "status" | "isHidden" | "isPinned">>) {
    setMessage("");
    const response = await fetch(`/api/admin/problems/${problem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: patch.status ?? problem.status, isHidden: patch.isHidden ?? problem.isHidden, isPinned: patch.isPinned ?? problem.isPinned }),
    });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "保存失败"); return; }
    await load();
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
    await load();
  }

  async function deleteProblem(problem: AdminProblem) {
    if (!window.confirm(`确认永久删除“${problem.title}”吗？该问题的全部讨论、参与关系、动态和足迹都会被删除，且无法恢复。`)) return;
    const response = await fetch(`/api/admin/problems/${problem.id}`, { method: "DELETE" });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "删除失败"); return; }
    setMessage("问题已删除");
    await load();
  }

  async function deleteMember(person: AdminMember) {
    if (!window.confirm(`确认永久删除成员“${person.displayName}”吗？其创建的 ${person.createdProblemCount} 个问题、评论、账户资料和头像都会被删除，且无法恢复。`)) return;
    const response = await fetch(`/api/admin/members/${person.id}`, { method: "DELETE" });
    const data = await response.json() as { message?: string };
    if (!response.ok) { setMessage(data.message ?? "删除失败"); return; }
    setMessage("成员已删除");
    await load();
  }

  return (
    <div className="site-shell">
      <SiteHeader active="admin" />
      <main className="admin-page">
        <header className="admin-heading"><div><span>{member?.role === "superadmin" ? "超级管理员" : "管理员"}</span><h1>{section === "problems" ? "问题管理" : "人员管理"}</h1><p>{section === "problems" ? "管理问题状态、置顶、公开可见性与永久删除。" : "维护账户状态、管理员任命、邀请额度与永久删除。"}</p></div></header>
        <AdminNav canManageMembers={member?.role === "superadmin"} section={section} />
        <form className="admin-search" onSubmit={(event) => event.preventDefault()}><Search aria-hidden="true" size={15} /><input onChange={(event) => setQuery(event.target.value)} placeholder={section === "problems" ? "搜索编号、标题、创建者或状态" : "搜索昵称、用户名、邮箱或角色"} value={query} /></form>
        <p className="form-message" aria-live="polite">{message}</p>

        {section === "problems" ? (
          <section className="admin-list" aria-busy={loading}>
            {visibleProblems.map((problem) => <article className={`admin-problem-row${problem.isHidden ? " hidden-record" : ""}`} key={problem.id}>
              <div className="admin-record-main"><span><code>{problem.shortCode}</code>{problem.isPinned && <i>置顶</i>}{problem.isHidden && <i>已隐藏</i>}</span><h2><Link href={`/problems/${problem.id}`}>{problem.title}</Link></h2><p>{problem.creatorName} · {problem.creatorEmail}</p></div>
              <div className="admin-record-stats"><span>{problem.participantCount} 人参与</span><span>{problem.messageCount} 条讨论</span><time>{relativeTime(problem.updatedAt)}更新</time></div>
              <label><span>状态</span><select aria-label={`${problem.title}的状态`} onChange={(event) => void updateProblem(problem, { status: event.target.value })} value={problem.status}><option>开放</option><option>已解决</option></select></label>
              <div className="admin-row-actions"><button onClick={() => void updateProblem(problem, { isPinned: !problem.isPinned })} type="button"><Pin aria-hidden="true" size={14} />{problem.isPinned ? "取消置顶" : "置顶"}</button><button onClick={() => void updateProblem(problem, { isHidden: !problem.isHidden })} type="button">{problem.isHidden ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}{problem.isHidden ? "恢复" : "隐藏"}</button><button className="danger" onClick={() => void deleteProblem(problem)} type="button"><Trash2 aria-hidden="true" size={14} />删除</button></div>
            </article>)}
            {!loading && !visibleProblems.length && <p className="empty-state">没有匹配的问题。</p>}
          </section>
        ) : (
          <section className="admin-list" aria-busy={loading}>
            {visibleMembers.map((person) => <form className={`admin-member-row${person.accountStatus === "suspended" ? " suspended-record" : ""}`} key={person.id} onSubmit={(event) => void saveMember(event, person)}>
              <div className="admin-person"><MemberAvatar avatarUpdatedAt={person.avatarUpdatedAt} initials={person.initials} memberId={person.id} /><div><h2><Link href={`/members/${person.id}`}>{person.displayName}</Link></h2><p>@{person.username} · {person.email}</p><small>注册于 {fullDate(person.createdAt)}</small></div></div>
              <div className="admin-record-stats"><span>{person.createdProblemCount} 个创建</span><span>{person.participatingCount} 个参与</span><span>{person.messageCount} 条讨论</span></div>
              <label><span>角色</span><select defaultValue={person.role} disabled={person.role === "superadmin"} name="role">{person.role === "superadmin" && <option value="superadmin">超级管理员</option>}<option value="member">普通成员</option><option value="admin">管理员</option></select>{person.role === "superadmin" && <input name="role" type="hidden" value="superadmin" />}</label>
              <label><span>账户</span><select defaultValue={person.accountStatus} disabled={person.id === member?.id} name="accountStatus"><option value="active">启用</option><option value="suspended">停用</option></select>{person.id === member?.id && <input name="accountStatus" type="hidden" value={person.accountStatus} />}</label>
              <label><span>邀请额度</span><input defaultValue={person.inviteQuota} max={10000} min={0} name="inviteQuota" type="number" /></label>
              <div className="admin-row-actions"><button className="primary" type="submit"><Save aria-hidden="true" size={14} />保存</button>{person.role !== "superadmin" && <button className="danger" onClick={() => void deleteMember(person)} type="button"><Trash2 aria-hidden="true" size={14} />删除</button>}</div>
            </form>)}
            {!loading && !visibleMembers.length && <p className="empty-state">没有匹配的成员。</p>}
          </section>
        )}
      </main>
    </div>
  );
}
