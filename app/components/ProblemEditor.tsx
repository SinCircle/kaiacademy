"use client";

import { AppLink as Link } from "./AppLink";
import { ArrowLeft, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { ProblemDetailData } from "../lib/types";
import { SiteHeader } from "./SiteHeader";
import { TagCombobox } from "./TagCombobox";
import { ClientFetchError, getCachedJson, invalidateClientCache } from "../lib/client-cache";

export function ProblemEditor({ mode, problemId }: { mode: "publish" | "settings"; problemId?: string }) {
  const settings = mode === "settings";
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [background, setBackground] = useState("");
  const [status, setStatus] = useState("开放");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!settings) {
      getCachedJson<{ member?: unknown }>("/api/session", {})
        .then((session) => {
          if (!session.member) { window.location.assign("/login?returnTo=%2Fproblems%2Fnew"); return; }
          setLoading(false);
        })
        .catch(() => window.location.assign("/login?returnTo=%2Fproblems%2Fnew"));
      return;
    }
    if (!problemId) return;
    getCachedJson<ProblemDetailData>(`/api/problems/${problemId}`, {})
      .then((data) => {
        if (!data) return;
        if (!data.viewer.canEditProblem) { window.location.assign(`/problems/${problemId}`); return; }
        setTitle(data.problem.title);
        setTags(data.problem.tags);
        setBody(data.problem.body);
        setBackground(data.problem.background);
        setStatus(data.problem.status);
        setIsCreator(data.viewer.isCreator);
      })
      .catch((error) => {
        if (error instanceof ClientFetchError && error.status === 401) {
          window.location.assign(`/login?returnTo=${encodeURIComponent(`/problems/${problemId}/settings`)}`);
          return;
        }
        setMessage(error instanceof Error ? error.message : "读取失败");
      })
      .finally(() => setLoading(false));
  }, [problemId, settings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(settings ? `/api/problems/${problemId}` : "/api/problems", {
        method: settings ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings ? { action: "update_problem", title, tags, body, background, status } : { title, tags, body, background }),
      });
      const data = await response.json() as { message?: string; problem?: { id: string } };
      if (response.status === 401) { window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`); return; }
      if (!response.ok) throw new Error(data.message ?? "保存失败");
      invalidateClientCache(["/api/problems", "/api/tags", "/api/members/", "/api/admin/", "/api/notifications"]);
      window.location.assign(`/problems/${settings ? problemId : data.problem?.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
      setSubmitting(false);
    }
  }

  async function deleteProblem() {
    if (!problemId) return;
    if (!window.confirm("确认永久删除这个问题吗？问题正文、全部讨论、参与关系、动态、足迹和附件都会被删除，且无法恢复。")) return;
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/problems/${problemId}`, { method: "DELETE" });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "删除失败");
      invalidateClientCache(["/api/problems", `/api/problems/${problemId}`, "/api/tags", "/api/members/", "/api/admin/problems", "/api/notifications"]);
      window.location.assign("/problems");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
      setDeleting(false);
    }
  }

  return (
    <div className="site-shell">
      <SiteHeader active="problems" />
      <main className="editor-page">
        <Link className="page-back" href={settings && problemId ? `/problems/${problemId}` : "/problems"}><ArrowLeft aria-hidden="true" size={14} />{settings ? "返回问题" : "返回难题"}</Link>
        <header><h1>{settings ? "问题设置" : "发布问题"}</h1><p>{settings ? "维护问题内容和状态。" : "发布一个可被检索、参与和持续讨论的数学问题。"}</p></header>
        {loading ? <div className="loading-block">读取问题内容…</div> : (
          <form className="problem-form" onSubmit={submit}>
            <section><h2>基本信息</h2><label><span>标题</span><input onChange={(event) => setTitle(event.target.value)} placeholder="用一句话描述问题" required value={title} /></label><TagCombobox onChange={setTags} value={tags} /></section>
            <section><h2>问题内容</h2><label><span>问题正文</span><textarea onChange={(event) => setBody(event.target.value)} placeholder="支持 Markdown 与 $...$ / $$...$$ 数学公式" required rows={12} value={body} /></label><label><span>背景与已知进展</span><textarea onChange={(event) => setBackground(event.target.value)} placeholder="可选：说明来源、已有结论和允许使用的工具" rows={6} value={background} /></label></section>
            {settings && <section><h2>状态</h2><label><span>问题状态</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option>开放</option><option>已解决</option></select></label></section>}
            {settings && isCreator && <section className="problem-owner-settings"><header><div><h2>创建者设置</h2><p>删除后，问题及其全部关联内容都无法恢复。</p></div></header><button className="secondary-button danger" disabled={deleting} onClick={() => void deleteProblem()} type="button"><Trash2 aria-hidden="true" size={14} />{deleting ? "删除中…" : "删除问题"}</button></section>}
            <p className="form-message" aria-live="polite">{message}</p>
            <footer><button className="primary-button" disabled={submitting} type="submit">{settings ? <Save aria-hidden="true" size={14} /> : <Send aria-hidden="true" size={14} />}{submitting ? "保存中…" : settings ? "保存设置" : "发布问题"}</button></footer>
          </form>
        )}
      </main>
    </div>
  );
}
