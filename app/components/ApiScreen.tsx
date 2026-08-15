"use client";

import { ChevronDown, Download, FileText, KeyRound, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCachedJson, invalidateClientCache, refreshCachedJson } from "../lib/client-cache";
import { relativeTime } from "../lib/format";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownTitle } from "./MarkdownTitle";
import { SiteHeader } from "./SiteHeader";

type Permission = "read" | "manage_pending_requests" | "create_problem" | "update_own_problem" | "create_direct_message" | "create_playground_post" | "update_own_playground_post";
type ApiKeyItem = { id: string; name: string; secretSuffix: string; permissions: Permission[]; status: "active" | "isolated" | "revoked"; isolationReason: string | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string };
type ReviewResource = { id?: string; kind?: string; displayName?: string; description?: string; mimeType?: string | null; byteSize?: number | null; externalUrl?: string | null; url?: string | null };
type ApiRequestItem = {
  id: string;
  action: Exclude<Permission, "read" | "manage_pending_requests">;
  problemId: string | null;
  playgroundPostId: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "failed";
  resultId: string | null;
  error: string | null;
  createdAt: string;
  reviewedAt: string | null;
  keyName: string;
  shortCode: string | null;
  problemTitle: string | null;
  currentBody: string | null;
  currentBackground: string | null;
  currentStatus: string | null;
  currentTags: string[];
  playgroundTitle: string | null;
  currentPlaygroundBody: string | null;
  currentPlaygroundTags: string[];
  currentPlaygroundResources: ReviewResource[];
  riskFlags: string[];
};
type ApiLogItem = { id: string; apiKeyId: string; keyName: string; method: string; path: string; statusCode: number; requestId: string | null; createdAt: string };
type StagedUpload = { id: string; apiKeyId: string; keyName: string; requestId: string | null; requestAction: ApiRequestItem["action"] | null; displayName: string; description: string; mimeType: string; byteSize: number; sha256: string; createdAt: string; expiresAt: string };
type Dashboard = {
  preference: { qualified: boolean; enabled: boolean };
  globalControl: { enabled: boolean; changedAt: string | null; changedBy: string | null; changedByName: string | null };
  keys: ApiKeyItem[];
  requests: ApiRequestItem[];
  logs: ApiLogItem[];
  stagedUploads: StagedUpload[];
};

const permissionLabels: Record<Permission, string> = {
  read: "读取",
  manage_pending_requests: "管理待处理请求",
  create_problem: "创建难题",
  update_own_problem: "修改难题",
  create_direct_message: "难题讨论",
  create_playground_post: "发布游乐场内容",
  update_own_playground_post: "修改游乐场内容",
};
const permissionDescriptions: Record<Permission, string> = {
  read: "读取难题、游乐场内容、可见讨论和当前 Key 权限，不写入浏览足迹",
  manage_pending_requests: "读取并删除当前 Key 自己提交的待处理请求",
  create_problem: "提交创建难题请求，执行前需要本人批准",
  update_own_problem: "不能修改他人的难题内容，执行前需要本人批准",
  create_direct_message: "新增难题顶层讨论",
  create_playground_post: "提交游乐场内容和隔离文件（会上传文件），执行前需要本人批准",
  update_own_playground_post: "不能修改他人的游乐场内容，执行前需要本人批准",
};
const actionLabels: Record<ApiRequestItem["action"], string> = {
  create_problem: "创建难题",
  update_own_problem: "修改自己创建的难题",
  create_direct_message: "添加直接讨论",
  create_playground_post: "创建游乐场内容",
  update_own_playground_post: "修改自己创建的游乐场内容",
};

const permissionOrder: Permission[] = ["read", "manage_pending_requests", "create_problem", "update_own_problem", "create_direct_message", "create_playground_post", "update_own_playground_post"];

function stringValue(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function stringArray(value: unknown, fallback: string[] = []) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback; }
function expiryLabel(value: string | null) { return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "永不过期"; }
function byteLabel(value: number) { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(2)} MB`; }
function expiryRemaining(value: string) { const hours = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 3_600_000)); return hours > 24 ? `${Math.ceil(hours / 24)} 天后清理` : `${hours} 小时后清理`; }
function resourceArray(value: unknown): ReviewResource[] { return Array.isArray(value) ? value.filter((item): item is ReviewResource => Boolean(item && typeof item === "object")) : []; }

export function ApiScreen() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"requests" | "history" | "quarantine">("requests");
  const [modal, setModal] = useState<null | { type: "create" } | { type: "permissions" | "history" | "download"; key: ApiKeyItem }>(null);
  const [permissionDraft, setPermissionDraft] = useState<Permission[]>(["read", "manage_pending_requests"]);
  const [busy, setBusy] = useState("");
  const [downloadError, setDownloadError] = useState("");

  async function load(force = false) {
    const next = force ? await refreshCachedJson<Dashboard>("/api/access/dashboard") : await getCachedJson<Dashboard>("/api/access/dashboard", { onUpdate: setData });
    if (!next.preference.enabled) { window.location.assign("/profile"); return; }
    setData(next);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "读取失败")).finally(() => setLoading(false));
  }, []);

  const pending = useMemo(() => data?.requests.filter((request) => request.status === "pending") ?? [], [data]);

  function openPermissions(key: ApiKeyItem) {
    setPermissionDraft(key.permissions);
    setModal({ type: "permissions", key });
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiration = String(form.get("expiration") ?? "180");
    const expiresAt = expiration === "never" ? null : new Date(Date.now() + Number(expiration) * 86_400_000).toISOString();
    setBusy("create");
    const response = await fetch("/api/access/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), expiresAt, permissions: ["read", "manage_pending_requests"] }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "创建失败"); setBusy(""); return; }
    setModal(null); setMessage("API Key 已创建，请从该行下载 Skill。");
    invalidateClientCache("/api/access/"); await load(true); setBusy("");
  }

  async function savePermissions() {
    if (!modal || modal.type !== "permissions") return;
    setBusy(`permissions:${modal.key.id}`);
    const response = await fetch(`/api/access/keys/${modal.key.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: permissionDraft }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "保存失败"); setBusy(""); return; }
    setModal(null); invalidateClientCache("/api/access/"); await load(true); setBusy("");
  }

  async function revokeKey(key: ApiKeyItem) {
    if (!window.confirm(`确认撤销 ${key.name}？撤销后无法继续调用或下载。`)) return;
    setBusy(`revoke:${key.id}`);
    const response = await fetch(`/api/access/keys/${key.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: key.permissions, status: "revoked" }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "撤销失败"); setBusy(""); return; }
    setModal(null); invalidateClientCache("/api/access/"); await load(true); setBusy("");
  }

  async function recoverKey(key: ApiKeyItem) {
    setBusy(`recover:${key.id}`); setMessage("");
    const response = await fetch(`/api/access/keys/${key.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "恢复失败"); setBusy(""); return; }
    invalidateClientCache("/api/access/"); await load(true); setBusy("");
  }

  async function downloadSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal.type !== "download") return;
    const form = new FormData(event.currentTarget);
    setDownloadError("");
    setBusy(`download:${modal.key.id}`);
    const response = await fetch(`/api/access/keys/${modal.key.id}/skill`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    if (!response.ok) {
      const result = await response.json() as { message?: string };
      setDownloadError(result.message ?? "下载失败"); setBusy(""); return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${modal.key.name}-SKILL.md`; anchor.click(); URL.revokeObjectURL(url);
    setModal(null); setBusy("");
  }

  async function review(request: ApiRequestItem, decision: "approve" | "reject") {
    const confirmRisk = decision === "approve" && request.riskFlags.length > 0;
    if (confirmRisk && !window.confirm(`这项修改包含高风险变化：${request.riskFlags.join("、")}。确认仍要批准吗？`)) return;
    setBusy(`review:${request.id}`); setMessage("");
    const response = await fetch(`/api/access/requests/${request.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, confirmRisk }) });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "处理失败"); setBusy(""); return; }
    setData((current) => current ? {
      ...current,
      requests: current.requests.map((item) => item.id === request.id ? { ...item, status: decision === "approve" ? "approved" : "rejected" } : item),
      stagedUploads: current.stagedUploads.filter((upload) => upload.requestId !== request.id),
    } : current);
    invalidateClientCache(["/api/access/", "/api/problems", "/api/playground", "/api/members/"]); await load(true); setBusy("");
  }

  async function discardUpload(upload: StagedUpload) {
    const consequence = upload.requestId ? "这会同时拒绝所属待审请求，并清理该请求的全部隔离文件。" : "清理后无法恢复。";
    if (!window.confirm(`确认立即清理 ${upload.displayName}？${consequence}`)) return;
    setBusy(`discard:${upload.id}`); setMessage("");
    const response = await fetch(`/api/access/uploads/${upload.id}`, { method: "DELETE" });
    const result = await response.json() as { message?: string };
    if (!response.ok) { setMessage(result.message ?? "清理失败"); setBusy(""); return; }
    invalidateClientCache("/api/access/dashboard"); await load(true); setBusy("");
  }

  if (loading) return <div className="site-shell"><SiteHeader active="api" /><main className="loading-page">正在读取 API 模块…</main></div>;
  if (!data) return <div className="site-shell"><SiteHeader active="api" /><main className="loading-page">{message || "API 模块不可用"}</main></div>;

  return <div className="site-shell"><SiteHeader active="api" /><main className="api-page">
    {!data.globalControl.enabled && <p className="api-global-paused">外部 API 已由管理员暂停。Key 与待处理请求均已保留。</p>}
    <section className="api-key-section" aria-label="API Key">
      <div className="api-key-table"><div className="api-key-head"><span>名称</span><span>状态</span><span>权限</span><span>最近使用</span><span>到期时间</span><span>操作</span></div>
        {data.keys.map((key) => <article className="api-key-row" key={key.id}>
          <div className="api-key-name"><KeyRound aria-hidden="true" size={15} /><span><b>{key.name}</b><code>••••••••{key.secretSuffix}</code></span></div>
          <span className={key.status === "active" ? "api-key-active" : key.status === "isolated" ? "api-key-isolated" : ""} title={key.isolationReason ?? undefined}>{key.status === "active" ? "有效" : key.status === "isolated" ? "隔离" : "已撤销"}</span>
          <span>{key.permissions.map((permission) => permissionLabels[permission]).join("、")}</span>
          <span>{key.lastUsedAt ? relativeTime(key.lastUsedAt) : "尚未使用"}</span><span>{expiryLabel(key.expiresAt)}</span>
          <div className="api-key-actions"><button onClick={() => setModal({ type: "history", key })} type="button">调用历史</button>{key.status === "isolated" ? <button disabled={busy === `recover:${key.id}`} onClick={() => void recoverKey(key)} type="button">{busy === `recover:${key.id}` ? "恢复中…" : "恢复"}</button> : <button disabled={key.status !== "active"} onClick={() => openPermissions(key)} type="button">权限管理</button>}<button aria-label={`下载 ${key.name} 的 Skill`} disabled={key.status !== "active"} onClick={() => { setDownloadError(""); setModal({ type: "download", key }); }} title="下载 Skill" type="button"><Download aria-hidden="true" size={14} /></button></div>
        </article>)}
        {!data.keys.length && <p className="api-empty-row">尚未创建 API Key。</p>}
      </div>
      <footer className="api-key-footer"><button className="primary-button" onClick={() => setModal({ type: "create" })} type="button"><Plus aria-hidden="true" size={14} />创建</button></footer>
    </section>

    <section className="api-activity-section"><nav aria-label="API 活动" className="api-activity-tabs"><button aria-selected={tab === "requests"} className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")} role="tab" type="button"><span>需要处理的请求</span><small>{pending.length}</small></button><button aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} role="tab" type="button"><span>操作历史</span><small>{data.logs.length}</small></button><button aria-selected={tab === "quarantine"} className={tab === "quarantine" ? "active" : ""} onClick={() => setTab("quarantine")} role="tab" type="button"><span>文件隔离区</span><small>{data.stagedUploads.length}</small></button></nav>
      {tab === "requests" ? <div className="api-review-list">{pending.map((request) => <ReviewSheet busy={busy === `review:${request.id}`} key={request.id} onDecision={(decision) => void review(request, decision)} request={request} uploads={data.stagedUploads.filter((upload) => upload.requestId === request.id)} />)}{!pending.length && <p className="empty-state">没有需要处理的请求。</p>}</div> : tab === "history" ? <div className="api-operation-list">{data.logs.map((log) => <article key={log.id}><time>{relativeTime(log.createdAt)}</time><div><b>{log.method === "GET" ? log.path.includes("/playground") ? "读取游乐场" : "读取难题" : log.requestId ? "提交待审阅请求" : log.path.endsWith("/uploads") ? "上传隔离文件" : "调用 API"}</b><p>{log.keyName} · {log.method} {log.path}</p></div><span className={log.statusCode < 400 ? "success" : "failed"}>{log.statusCode < 400 ? log.statusCode === 202 ? "待确认" : "成功" : "失败"}</span></article>)}{!data.logs.length && <p className="empty-state">还没有 API 调用记录。</p>}</div> : <div className="api-quarantine">{data.stagedUploads.map((upload) => <article key={upload.id}><FileText aria-hidden="true" size={15} /><div><b>{upload.displayName}</b><p>{upload.keyName} · {byteLabel(upload.byteSize)} · {expiryRemaining(upload.expiresAt)}</p></div><span className="api-quarantine-actions"><a download href={`/api/access/uploads/${upload.id}`}><Download aria-hidden="true" size={13} />下载检查</a><button disabled={busy === `discard:${upload.id}`} onClick={() => void discardUpload(upload)} type="button"><Trash2 aria-hidden="true" size={13} />{busy === `discard:${upload.id}` ? "清理中…" : "立即清理"}</button></span></article>)}{!data.stagedUploads.length && <p className="empty-state">没有隔离文件。</p>}</div>}
    </section><p aria-live="polite" className="page-message">{message}</p>
  </main>

  {modal && <div className="api-dialog-backdrop"><section aria-modal="true" className="api-modal" role="dialog"><button aria-label="关闭" className="api-dialog-close" onClick={() => setModal(null)} type="button"><X aria-hidden="true" size={18} /></button>
    {modal.type === "create" && <><header><h2>创建 API Key</h2><p>创建后再从该行设置实际需要的权限。</p></header><form className="api-form" onSubmit={(event) => void createKey(event)}><label><span>名称</span><input name="name" placeholder="例如：research-skill" required /></label><label><span>到期时间</span><select defaultValue="180" name="expiration"><option value="180">180 天</option><option value="365">1 年</option><option value="never">永不过期</option></select></label><footer><button className="secondary-button" onClick={() => setModal(null)} type="button">取消</button><button className="primary-button" disabled={busy === "create"} type="submit">{busy === "create" ? "创建中…" : "创建"}</button></footer></form></>}
    {modal.type === "permissions" && <><header><h2>{modal.key.name} 的权限</h2><p>建议只开放这个工具实际需要的能力。</p></header><div className="api-permission-form">{permissionOrder.map((permission) => <div className="api-permission-row" key={permission}><span id={`api-permission-label-${permission}`}><b>{permissionLabels[permission]}</b><small>{permissionDescriptions[permission]}</small></span><input aria-labelledby={`api-permission-label-${permission}`} checked={permissionDraft.includes(permission)} disabled={permission === "read"} onChange={(event) => setPermissionDraft((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} type="checkbox" /></div>)}<footer><button className="secondary-button api-danger-button" disabled={busy === `revoke:${modal.key.id}`} onClick={() => void revokeKey(modal.key)} type="button">撤销 Key</button><span /><button className="secondary-button" onClick={() => setModal(null)} type="button">取消</button><button className="primary-button" disabled={busy === `permissions:${modal.key.id}`} onClick={() => void savePermissions()} type="button">保存</button></footer></div></>}
    {modal.type === "history" && <><header><h2>{modal.key.name} 的调用历史</h2><p>只记录调用范围和结果，不保存读取响应的正文。</p></header><div className="api-modal-history">{data.logs.filter((log) => log.apiKeyId === modal.key.id).map((log) => <div key={log.id}><time>{relativeTime(log.createdAt)}</time><span><b>{log.method} {log.path}</b><code>{log.statusCode}</code></span><i>{log.statusCode < 400 ? "成功" : "失败"}</i></div>)}{!data.logs.some((log) => log.apiKeyId === modal.key.id) && <p className="empty-state">暂无调用记录。</p>}</div></>}
    {modal.type === "download" && <><header><h2>下载 Skill</h2><p>验证密码后，将下载包含 <b>{modal.key.name}</b> 完整 API Key 的 SKILL.md。请妥善保管，不要上传、公开或转发。</p></header><form className="api-form api-download-form" onSubmit={(event) => void downloadSkill(event)}><label><span>账户密码</span><input aria-describedby="api-download-error" aria-invalid={Boolean(downloadError)} autoComplete="current-password" name="password" placeholder="输入当前密码" required type="password" /></label><p aria-live="polite" className="form-message" id="api-download-error" role={downloadError ? "alert" : undefined}>{downloadError}</p><footer><button className="secondary-button" onClick={() => setModal(null)} type="button">取消</button><button className="primary-button" disabled={busy === `download:${modal.key.id}`} type="submit">{busy === `download:${modal.key.id}` ? "验证中…" : "验证并下载"}</button></footer></form></>}
  </section></div>}
  </div>;
}

function ReviewSheet({ busy, onDecision, request, uploads }: { busy: boolean; onDecision: (decision: "approve" | "reject") => void; request: ApiRequestItem; uploads: StagedUpload[] }) {
  const nextTitle = stringValue(request.payload.title, request.problemTitle ?? "未命名难题");
  const nextBody = stringValue(request.payload.body, request.currentBody ?? "");
  const nextBackground = stringValue(request.payload.background, request.currentBackground ?? "");
  const nextStatus = stringValue(request.payload.status, request.currentStatus ?? "开放");
  const nextTags = stringArray(request.payload.tags, request.currentTags);
  const directMessage = request.action === "create_direct_message";
  const playground = request.action === "create_playground_post" || request.action === "update_own_playground_post";
  const modifying = request.action === "update_own_problem" || request.action === "update_own_playground_post";
  const playgroundResources: ReviewResource[] = [...uploads.map((upload) => ({ ...upload, kind: "upload" })), ...resourceArray(request.payload.externalResources).map((resource) => ({ ...resource, kind: "external" }))];
  return <article className="api-review-sheet"><header><div className="api-review-identity"><p><span>API 名称</span><b>{request.keyName}</b></p><p><span>操作类型</span><b>{actionLabels[request.action]}</b></p>{request.riskFlags.length > 0 && <p className="api-review-risk"><span>风险提示</span><b>{request.riskFlags.join("、")}</b></p>}</div><div><button className="reject" disabled={busy} onClick={() => onDecision("reject")} type="button">拒绝</button><button className="approve" disabled={busy} onClick={() => onDecision("approve")} type="button">{busy ? "处理中…" : "批准"}</button></div></header>
    <div className={`api-review-content${modifying ? " has-current" : ""}`}><section className="api-review-panel">{directMessage ? <ReviewDiscussionContent body={stringValue(request.payload.body)} shortCode={request.shortCode} title={request.problemTitle ?? "未命名难题"} /> : playground ? <ReviewPlaygroundContent body={stringValue(request.payload.body)} resources={playgroundResources} tags={stringArray(request.payload.tags)} title={stringValue(request.payload.title, request.playgroundTitle ?? "未命名内容")} /> : <ReviewProblemContent background={nextBackground} body={nextBody} shortCode={modifying ? request.shortCode : null} status={nextStatus} tags={nextTags} title={nextTitle} />}</section>
      {request.action === "update_own_problem" && <section className="api-review-panel current"><h3>当前内容</h3><ReviewProblemContent background={request.currentBackground ?? ""} body={request.currentBody ?? ""} shortCode={request.shortCode} status={request.currentStatus ?? "开放"} tags={request.currentTags} title={request.problemTitle ?? "未命名难题"} /></section>}
      {request.action === "update_own_playground_post" && <section className="api-review-panel current"><h3>当前内容</h3><ReviewPlaygroundContent body={request.currentPlaygroundBody ?? ""} resources={request.currentPlaygroundResources} tags={request.currentPlaygroundTags} title={request.playgroundTitle ?? "未命名内容"} /></section>}
    </div>
  </article>;
}

function ReviewPlaygroundContent({ body, resources, tags, title }: { body: string; resources: ReviewResource[]; tags: string[]; title: string }) {
  return <div className="api-review-document playground"><h2><MarkdownTitle source={title} /></h2>{tags.length > 0 && <div className="api-review-document-meta"><p>{tags.join(" / ")}</p></div>}<MarkdownContent source={body} />{resources.length > 0 && <div className="api-review-resources">{resources.map((resource, index) => <div className="playground-resource api-review-resource" key={resource.id ?? `${resource.displayName}-${index}`}><FileText aria-hidden="true" size={14} /><span><b>{resource.displayName ?? "未命名资源"}</b>{resource.description && <small>{resource.description}</small>}</span>{typeof resource.byteSize === "number" && <em>{byteLabel(resource.byteSize)}</em>}{(resource.externalUrl || resource.url) && <em>外链</em>}</div>)}</div>}</div>;
}

function ReviewProblemContent({ background, body, shortCode, status, tags, title }: { background: string; body: string; shortCode: string | null; status: string; tags: string[]; title: string }) {
  return <div className="api-review-document">{shortCode && <code className="api-review-short-code">{shortCode}</code>}<h2><MarkdownTitle source={title} /></h2><div className="api-review-document-meta"><span>{status}</span>{tags.length > 0 && <p>{tags.join(" / ")}</p>}</div>{background && <details className="problem-background"><summary><ChevronDown aria-hidden="true" size={14} />背景与已知进展</summary><MarkdownContent source={background} /></details>}<MarkdownContent source={body} /></div>;
}

function ReviewDiscussionContent({ body, shortCode, title }: { body: string; shortCode: string | null; title: string }) {
  return <div className="api-review-document discussion">{shortCode && <code className="api-review-short-code">{shortCode}</code>}<h2><MarkdownTitle source={title} /></h2><MarkdownContent source={body} /></div>;
}
