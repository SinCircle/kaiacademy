"use client";

import { ArrowLeft, ExternalLink, File, Link2, Save, Send, Trash2, Upload, UserRound } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { DraftExternalResource, PlaygroundDetailData, PlaygroundResource } from "../lib/playground";
import { MAX_PLAYGROUND_RESOURCES, MAX_PLAYGROUND_UPLOAD_BYTES, formatResourceBytes, validatePlaygroundUpload } from "../lib/playground";
import { ClientFetchError, getCachedJson, invalidateClientCache } from "../lib/client-cache";
import { AppLink as Link } from "./AppLink";
import { ContentTransferDialog, type ContentTransferCandidate } from "./ContentTransferDialog";
import { SiteHeader } from "./SiteHeader";
import { TagCombobox } from "./TagCombobox";

type FileDraft = { id: string; file: File; description: string };
export function PlaygroundEditor({ mode, postId }: { mode: "publish" | "settings"; postId?: string }) {
  const settings = mode === "settings";
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [existingResources, setExistingResources] = useState<PlaygroundResource[]>([]);
  const [files, setFiles] = useState<FileDraft[]>([]);
  const [externalResources, setExternalResources] = useState<DraftExternalResource[]>([]);
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalDescription, setExternalDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [canManageContent, setCanManageContent] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [ownerActionPending, setOwnerActionPending] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState("");

  useEffect(() => {
    if (!settings) {
      getCachedJson<{ member?: unknown }>("/api/session", {})
        .then((session) => {
          if (!session.member) { window.location.assign("/login?returnTo=%2Fplayground%2Fnew"); return; }
          setLoading(false);
        })
        .catch(() => window.location.assign("/login?returnTo=%2Fplayground%2Fnew"));
      return;
    }
    if (!postId) return;
    getCachedJson<PlaygroundDetailData>(`/api/playground/${postId}`, {})
      .then((data) => {
        if (!data.viewer?.canEdit) { window.location.assign(`/playground/${postId}`); return; }
        setTitle(data.post.title);
        setTags(data.post.tags);
        setBody(data.post.body);
        setExistingResources(data.resources);
        setCanManageContent(Boolean(data.viewer.canEdit));
      })
      .catch((error) => {
        if (error instanceof ClientFetchError && error.status === 401) window.location.assign(`/login?returnTo=${encodeURIComponent(`/playground/${postId}/settings`)}`);
        else setMessage(error instanceof Error ? error.message : "读取失败");
      })
      .finally(() => setLoading(false));
  }, [postId, settings]);

  const retainedUploadBytes = useMemo(() => existingResources.reduce((sum, resource) => sum + (resource.kind === "upload" ? resource.byteSize ?? 0 : 0), 0), [existingResources]);
  const newUploadBytes = useMemo(() => files.reduce((sum, item) => sum + item.file.size, 0), [files]);
  const resourceCount = existingResources.length + files.length + externalResources.length;

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!selected.length) return;
    if (resourceCount + selected.length > MAX_PLAYGROUND_RESOURCES) { setMessage(`每篇内容最多添加 ${MAX_PLAYGROUND_RESOURCES} 个资源`); return; }
    for (const file of selected) {
      const error = validatePlaygroundUpload(file);
      if (error) { setMessage(`${file.name}：${error}`); return; }
    }
    if (retainedUploadBytes + newUploadBytes + selected.reduce((sum, file) => sum + file.size, 0) > MAX_PLAYGROUND_UPLOAD_BYTES) {
      setMessage("同一帖子内的本地文件合计不能超过 10 MB");
      return;
    }
    setFiles((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, description: "" }))]);
    setMessage("");
  }

  function addExternal() {
    if (resourceCount >= MAX_PLAYGROUND_RESOURCES) { setMessage(`每篇内容最多添加 ${MAX_PLAYGROUND_RESOURCES} 个资源`); return; }
    let url: URL;
    try { url = new URL(externalUrl.trim()); } catch { setMessage("请填写有效的外部链接"); return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") { setMessage("外部链接只支持 HTTP 或 HTTPS"); return; }
    if (!externalName.trim()) { setMessage("请填写外链资源标题"); return; }
    setExternalResources((current) => [...current, { displayName: externalName.trim(), description: externalDescription.trim(), url: url.toString() }]);
    setExternalName(""); setExternalUrl(""); setExternalDescription(""); setExternalOpen(false); setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("body", body);
      form.set("tags", JSON.stringify(tags));
      form.set("keepResourceIds", JSON.stringify(existingResources.map((resource) => resource.id)));
      form.set("externalResources", JSON.stringify(externalResources));
      form.set("fileDescriptions", JSON.stringify(files.map((item) => item.description)));
      files.forEach((item) => form.append("files", item.file));
      const response = await fetch(settings ? `/api/playground/${postId}` : "/api/playground", { method: settings ? "PATCH" : "POST", body: form });
      const result = await response.json() as { message?: string; post?: { id: string } };
      if (response.status === 401) { window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`); return; }
      if (!response.ok) throw new Error(result.message ?? "保存失败");
      const id = settings ? postId : result.post?.id;
      invalidateClientCache(["/api/playground", "/api/admin/playground", "/api/members/", ...(id ? [`/api/playground/${id}`] : [])]);
      window.location.assign(`/playground/${id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
      setSubmitting(false);
    }
  }

  function closeTransfer() {
    if (ownerActionPending) return;
    setTransferOpen(false);
    setOwnerMessage("");
  }

  async function transferOwnership(transferTarget: ContentTransferCandidate) {
    if (!postId) return;
    if (!window.confirm(`确认将这篇内容转让给“${transferTarget.displayName}”吗？确认后，对方将成为新的创建者。`)) return;
    setOwnerActionPending(true);
    setOwnerMessage("");
    try {
      const response = await fetch(`/api/playground/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer_ownership", targetMemberId: transferTarget.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "转让失败");
      invalidateClientCache(["/api/playground", `/api/playground/${postId}`, "/api/admin/playground", "/api/members/", "/api/notifications"]);
      window.location.assign(`/playground/${postId}`);
    } catch (error) {
      setOwnerMessage(error instanceof Error ? error.message : "转让失败");
      setOwnerActionPending(false);
    }
  }

  async function deleteContent() {
    if (!postId) return;
    if (!window.confirm("确认永久删除这篇内容吗？正文、资源文件和全部讨论都会被删除，且无法恢复。")) return;
    setOwnerActionPending(true);
    setOwnerMessage("");
    try {
      const response = await fetch(`/api/playground/${postId}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "删除失败");
      invalidateClientCache(["/api/playground", `/api/playground/${postId}`, "/api/admin/playground", "/api/members/", "/api/notifications"]);
      window.location.assign("/playground");
    } catch (error) {
      setOwnerMessage(error instanceof Error ? error.message : "删除失败");
      setOwnerActionPending(false);
    }
  }

  return <div className="site-shell">
    <SiteHeader active="playground" />
    <main className="editor-page playground-editor-page">
      <Link className="page-back" href={settings && postId ? `/playground/${postId}` : "/playground"}><ArrowLeft aria-hidden="true" size={14} />{settings ? "返回内容" : "返回游乐场"}</Link>
      <header><h1>{settings ? "内容设置" : "发布内容"}</h1><p>{settings ? "维护正文和资源文件。" : "发布帖子，或把资源整理成可复用的档案。"}</p></header>
      {loading ? <div className="loading-block">正在读取内容…</div> : <form className="problem-form playground-form" onSubmit={submit}>
        <section><h2>基本信息</h2><label><span>标题</span><input maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="用一句话说明这篇内容" required value={title} /></label><TagCombobox onChange={setTags} value={tags} /></section>
        <section><h2>发布内容</h2><label><span>正文</span><textarea maxLength={100000} onChange={(event) => setBody(event.target.value)} placeholder="支持 Markdown 与 $...$ / $$...$$ 数学公式" required rows={18} value={body} /></label></section>
        <section className="playground-resource-editor">
          <header><div><h2>资源文件</h2><p>可上传本站文件或添加外部文件链接；同一帖子内的本地文件合计不超过 10 MB。</p></div><span>{resourceCount} / {MAX_PLAYGROUND_RESOURCES}</span></header>
          <div className="playground-editor-resources">
            {existingResources.map((resource) => <article key={resource.id}>{resource.kind === "upload" ? <File aria-hidden="true" size={18} /> : <ExternalLink aria-hidden="true" size={18} />}<span><b>{resource.displayName}</b><small>{resource.kind === "upload" ? formatResourceBytes(resource.byteSize) : "外部链接"}</small></span><button aria-label={`移除${resource.displayName}`} onClick={() => setExistingResources((current) => current.filter((item) => item.id !== resource.id))} type="button"><Trash2 aria-hidden="true" size={14} /></button></article>)}
            {files.map((item) => <article key={item.id}><File aria-hidden="true" size={18} /><span><b>{item.file.name}</b><small>{formatResourceBytes(item.file.size)}</small><input aria-label={`${item.file.name}的说明`} maxLength={240} onChange={(event) => setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, description: event.target.value } : entry))} placeholder="文件说明（可选）" value={item.description} /></span><button aria-label={`移除${item.file.name}`} onClick={() => setFiles((current) => current.filter((entry) => entry.id !== item.id))} type="button"><Trash2 aria-hidden="true" size={14} /></button></article>)}
            {externalResources.map((resource, index) => <article key={`${resource.url}-${index}`}><ExternalLink aria-hidden="true" size={18} /><span><b>{resource.displayName}</b><small>{resource.url}</small></span><button aria-label={`移除${resource.displayName}`} onClick={() => setExternalResources((current) => current.filter((_, currentIndex) => currentIndex !== index))} type="button"><Trash2 aria-hidden="true" size={14} /></button></article>)}
          </div>

          {externalOpen && <div className="playground-external-editor">
            <label><span>资源标题</span><input maxLength={160} onChange={(event) => setExternalName(event.target.value)} placeholder="例如：完整数据集" value={externalName} /></label>
            <label><span>文件链接</span><input onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://example.com/file.zip" type="url" value={externalUrl} /></label>
            <label className="wide"><span>资源说明（可选）</span><input maxLength={240} onChange={(event) => setExternalDescription(event.target.value)} placeholder="说明内容、格式或适用环境" value={externalDescription} /></label>
            <footer><button className="secondary-button" onClick={() => setExternalOpen(false)} type="button">取消</button><button className="primary-button" onClick={addExternal} type="button">确认添加</button></footer>
          </div>}

          <div className="playground-resource-add">
            <label className="secondary-button"><Upload aria-hidden="true" size={14} />上传文件<input multiple onChange={addFiles} type="file" /></label>
            <button className="secondary-button" disabled={externalOpen} onClick={() => setExternalOpen(true)} type="button"><Link2 aria-hidden="true" size={14} />添加文件链接</button>
          </div>
        </section>
        {settings && canManageContent && <section className="playground-owner-settings">
          <header><div><h2>创建者设置</h2><p>转让后由新创建者维护内容；删除后无法恢复。</p></div></header>
          <div className="playground-owner-actions">
            <button className="secondary-button" disabled={ownerActionPending} onClick={() => { setTransferOpen(true); setOwnerMessage(""); }} type="button"><UserRound aria-hidden="true" size={14} />转让内容</button>
            <button className="secondary-button danger" disabled={ownerActionPending} onClick={() => void deleteContent()} type="button"><Trash2 aria-hidden="true" size={14} />删除内容</button>
          </div>
          <p aria-live="polite" className="form-message">{ownerMessage}</p>
        </section>}
        <p className="form-message" aria-live="polite">{message}</p>
        <footer><button className="primary-button" disabled={submitting} type="submit">{settings ? <Save aria-hidden="true" size={14} /> : <Send aria-hidden="true" size={14} />}{submitting ? "保存中…" : settings ? "保存设置" : "发布内容"}</button></footer>
      </form>}
      <ContentTransferDialog message={ownerMessage} onClose={closeTransfer} onConfirm={transferOwnership} onResetMessage={() => setOwnerMessage("")} open={transferOpen} pending={ownerActionPending} searchEndpoint={postId ? `/api/playground/${postId}/transfer-candidates` : ""} />
    </main>
  </div>;
}
