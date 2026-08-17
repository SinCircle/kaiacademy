"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { MemberAvatar } from "./MemberAvatar";

export type ContentTransferCandidate = {
  id: string;
  displayName: string;
  username: string;
  initials: string;
  avatarUpdatedAt: string | null;
};

type ContentTransferDialogProps = {
  open: boolean;
  pending: boolean;
  searchEndpoint: string;
  message: string;
  onClose: () => void;
  onConfirm: (candidate: ContentTransferCandidate) => void | Promise<void>;
  onResetMessage?: () => void;
};

export function ContentTransferDialog({
  open,
  pending,
  searchEndpoint,
  message,
  onClose,
  onConfirm,
  onResetMessage,
}: ContentTransferDialogProps) {
  const titleId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ContentTransferCandidate[]>([]);
  const [target, setTarget] = useState<ContentTransferCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  useEffect(() => {
    if (open) return;
    setQuery("");
    setCandidates([]);
    setTarget(null);
    setSearching(false);
    setSearchMessage("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setCandidates([]);
      setSearching(false);
      setSearchMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchMessage("");
      try {
        const separator = searchEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${searchEndpoint}${separator}q=${encodeURIComponent(normalizedQuery)}`, { signal: controller.signal });
        const data = await response.json() as { items?: ContentTransferCandidate[]; message?: string };
        if (!response.ok) throw new Error(data.message ?? "搜索失败");
        setCandidates(data.items ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidates([]);
        setSearchMessage(error instanceof Error ? error.message : "搜索失败");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, searchEndpoint]);

  if (!open) return null;

  const visibleMessage = searchMessage || message;
  function requestClose() {
    if (!pending) onClose();
  }

  return <div className="playground-risk-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }} role="presentation">
    <section aria-labelledby={titleId} aria-modal="true" className="playground-transfer-dialog" role="dialog">
      <button aria-label="关闭" className="playground-dialog-close" disabled={pending} onClick={requestClose} type="button"><X aria-hidden="true" size={18} /></button>
      <h2 id={titleId}>转让内容</h2>
      <p>搜索并选择新的创建者。确认后，此内容的编辑和删除权限将一并转交。</p>
      <label className="playground-transfer-search"><Search aria-hidden="true" size={15} /><input onChange={(event) => {
        setQuery(event.target.value);
        setTarget(null);
        setSearchMessage("");
        onResetMessage?.();
      }} placeholder="搜索昵称或用户名" ref={searchRef} value={query} /></label>
      <div aria-busy={searching} className="playground-transfer-results">
        {candidates.map((candidate) => <button aria-pressed={target?.id === candidate.id} className={target?.id === candidate.id ? "active" : ""} key={candidate.id} onClick={() => setTarget(candidate)} type="button"><MemberAvatar avatarUpdatedAt={candidate.avatarUpdatedAt} initials={candidate.initials} memberId={candidate.id} /><span><b>{candidate.displayName}</b><small>@{candidate.username}</small></span></button>)}
        {searching && <p>正在搜索…</p>}
        {!searching && query.trim() && !candidates.length && !searchMessage && <p>没有匹配的成员。</p>}
        {!searching && !query.trim() && <p>输入昵称或用户名开始搜索。</p>}
      </div>
      <p aria-live="polite" className="form-message">{visibleMessage}</p>
      <footer><button className="secondary-button" disabled={pending} onClick={requestClose} type="button">取消</button><button className="primary-button" disabled={!target || pending} onClick={() => { if (target) void onConfirm(target); }} type="button">{pending ? "转让中…" : "确认转让"}</button></footer>
    </section>
  </div>;
}
