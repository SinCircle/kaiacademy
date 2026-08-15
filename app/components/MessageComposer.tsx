"use client";

import { FileText, FileUp, Plus, Send, Trash2, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  attachmentMarker,
  attachmentMarkerPattern,
  latexToMarkdown,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_ATTACHMENT_TITLE,
  utf8Size,
  type DraftMessageAttachment,
  type MessageDraft,
} from "../lib/message-attachments";
import { MemberAvatar } from "./MemberAvatar";

type ComposerProps = {
  onSubmit(draft: MessageDraft): Promise<boolean>;
  placeholder: string;
  compact?: boolean;
  allowAttachments?: boolean;
  initials?: string;
  memberId?: string;
  avatarUpdatedAt?: string | null;
};

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "");
  if (!(node instanceof HTMLElement)) return "";
  const attachmentId = node.dataset.attachmentId;
  if (attachmentId) return attachmentMarker(attachmentId);
  if (node.tagName === "BR") return "\n";
  const content = Array.from(node.childNodes).map(serializeNode).join("");
  return ["DIV", "P", "LI"].includes(node.tagName) && content && !content.endsWith("\n") ? `${content}\n` : content;
}

function serializeEditor(editor: HTMLElement) {
  return Array.from(editor.childNodes).map(serializeNode).join("").replace(/\n{3,}/g, "\n\n");
}

function createAttachmentElement(attachment: DraftMessageAttachment) {
  const element = document.createElement("span");
  element.className = "message-draft-attachment";
  element.contentEditable = "false";
  element.dataset.attachmentId = attachment.draftId;
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("title", "编辑这个附件");
  element.textContent = attachment.title;
  return element;
}

function selectionInside(editor: HTMLElement, range: Range | null) {
  return Boolean(range && editor.contains(range.commonAncestorContainer));
}

function textCaretRect(node: Text, offset: number) {
  if (!node.length) return null;
  const probe = document.createRange();
  const atStart = offset <= 0;
  const index = atStart ? 0 : Math.min(offset - 1, node.length - 1);
  probe.setStart(node, index);
  probe.setEnd(node, index + 1);
  const rect = probe.getClientRects()[0] ?? probe.getBoundingClientRect();
  if (!rect.height) return null;
  return { left: atStart ? rect.left : rect.right, top: rect.top, height: rect.height };
}

function caretRect(range: Range) {
  const direct = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (direct.height) return { left: direct.left, top: direct.top, height: direct.height };

  const container = range.startContainer;
  const offset = range.startOffset;
  if (container.nodeType === Node.TEXT_NODE) return textCaretRect(container as Text, offset);
  if (!(container instanceof Element)) return null;

  const previous = container.childNodes[offset - 1];
  if (previous?.nodeType === Node.TEXT_NODE) {
    const rect = textCaretRect(previous as Text, (previous.nodeValue ?? "").length);
    if (rect) return rect;
  }
  if (previous instanceof HTMLElement) {
    const rect = previous.getBoundingClientRect();
    if (rect.height) return { left: rect.right, top: rect.top, height: rect.height };
  }

  const next = container.childNodes[offset];
  if (next?.nodeType === Node.TEXT_NODE) {
    const rect = textCaretRect(next as Text, 0);
    if (rect) return rect;
  }
  if (next instanceof HTMLElement) {
    const rect = next.getBoundingClientRect();
    if (rect.height) return { left: rect.left, top: rect.top, height: rect.height };
  }
  return null;
}

function insertPlainText(editor: HTMLElement, text: string) {
  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selectionInside(editor, range)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  let lastNode: Node | null = null;
  text.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
    if (index > 0) {
      lastNode = document.createElement("br");
      fragment.append(lastNode);
    }
    if (line) {
      lastNode = document.createTextNode(line);
      fragment.append(lastNode);
    }
  });
  if (!lastNode) lastNode = fragment.appendChild(document.createTextNode(""));
  range.insertNode(fragment);
  range.setStartAfter(lastNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function MessageComposer({ onSubmit, placeholder, compact = false, allowAttachments = true, initials = "", memberId = "", avatarUpdatedAt = null }: ComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [serialized, setSerialized] = useState("");
  const [attachments, setAttachments] = useState<DraftMessageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [editorFocused, setEditorFocused] = useState(false);
  const [caretPosition, setCaretPosition] = useState({ left: 0, top: 16 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentContent, setAttachmentContent] = useState("");
  const [attachmentSource, setAttachmentSource] = useState("");
  const [attachmentError, setAttachmentError] = useState("");

  const syncEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = serializeEditor(editor);
    setSerialized(next);
    const attachedIds = new Set(Array.from(next.matchAll(attachmentMarkerPattern()), (match) => match[1].toLocaleLowerCase()));
    setAttachments((current) => current.filter((attachment) => attachedIds.has(attachment.draftId.toLocaleLowerCase())));
  }, []);

  const updateCaretPosition = useCallback(() => {
    const editor = editorRef.current;
    const wrap = editorWrapRef.current;
    const selection = window.getSelection();
    if (!editor || !wrap || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!selectionInside(editor, range)) return;
    savedRangeRef.current = range.cloneRange();
    const wrapRect = wrap.getBoundingClientRect();
    const rangeRect = caretRect(range);
    const left = rangeRect ? rangeRect.left - wrapRect.left : 0;
    const top = rangeRect ? rangeRect.top - wrapRect.top + rangeRect.height / 2 : 16;
    setCaretPosition({
      left: Math.max(0, Math.min(left, wrapRect.width - 17)),
      top: Math.max(9, Math.min(top, wrapRect.height - 9)),
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", updateCaretPosition);
    return () => document.removeEventListener("selectionchange", updateCaretPosition);
  }, [updateCaretPosition]);

  useEffect(() => {
    if (!dialogOpen) return;
    window.setTimeout(() => titleInputRef.current?.focus(), 0);
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDialogOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  function openNewAttachment() {
    if (attachments.length >= MAX_MESSAGE_ATTACHMENTS) {
      setError(`每条讨论最多携带 ${MAX_MESSAGE_ATTACHMENTS} 个附件`);
      return;
    }
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (editor && selection?.rangeCount && selectionInside(editor, selection.getRangeAt(0))) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setEditingId(null);
    setAttachmentTitle("");
    setAttachmentContent("");
    setAttachmentSource("");
    setAttachmentError("");
    setDialogOpen(true);
  }

  function openExistingAttachment(id: string) {
    const attachment = attachments.find((item) => item.draftId === id);
    if (!attachment) return;
    setEditingId(id);
    setAttachmentTitle(attachment.title);
    setAttachmentContent(attachment.content);
    setAttachmentSource("");
    setAttachmentError("");
    setDialogOpen(true);
  }

  function insertAttachment(attachment: DraftMessageAttachment) {
    const editor = editorRef.current;
    if (!editor) return;
    let range = savedRangeRef.current;
    if (!selectionInside(editor, range)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const element = createAttachmentElement(attachment);
    range.insertNode(element);
    range.setStartAfter(element);
    range.collapse(true);
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRangeRef.current = range.cloneRange();
    syncEditor();
    updateCaretPosition();
  }

  function saveAttachment() {
    const title = attachmentTitle.replace(/\s+/g, " ").trim();
    const content = attachmentContent.replace(/\r\n?/g, "\n");
    if (!title) { setAttachmentError("请填写附件标题"); return; }
    if (title.length > MAX_MESSAGE_ATTACHMENT_TITLE) { setAttachmentError(`标题不能超过 ${MAX_MESSAGE_ATTACHMENT_TITLE} 个字符`); return; }
    if (!content.trim()) { setAttachmentError("请填写 Markdown 文本"); return; }
    if (utf8Size(content) > MAX_MESSAGE_ATTACHMENT_BYTES) { setAttachmentError("附件不能超过 1 MiB"); return; }

    if (editingId) {
      setAttachments((current) => current.map((attachment) => attachment.draftId === editingId ? { ...attachment, title, content } : attachment));
      const element = editorRef.current?.querySelector<HTMLElement>(`[data-attachment-id="${editingId}"]`);
      if (element) element.textContent = title;
    } else {
      const attachment = { draftId: crypto.randomUUID(), title, content };
      setAttachments((current) => [...current, attachment]);
      window.setTimeout(() => insertAttachment(attachment), 0);
    }
    setError("");
    setDialogOpen(false);
  }

  function removeAttachment() {
    if (!editingId) return;
    const element = editorRef.current?.querySelector<HTMLElement>(`[data-attachment-id="${editingId}"]`);
    element?.remove();
    setAttachments((current) => current.filter((attachment) => attachment.draftId !== editingId));
    setDialogOpen(false);
    syncEditor();
  }

  async function extractFile(file: File | undefined) {
    if (!file) return;
    setAttachmentError("");
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    if (!extension || !["txt", "md", "tex"].includes(extension)) { setAttachmentError("仅支持 txt、md 和 tex 文件"); return; }
    if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) { setAttachmentError("源文件不能超过 1 MiB"); return; }
    try {
      const extracted = extension === "tex" ? latexToMarkdown(await file.text()) : (await file.text()).replace(/\r\n?/g, "\n");
      if (utf8Size(extracted) > MAX_MESSAGE_ATTACHMENT_BYTES) { setAttachmentError("转换后的 Markdown 超过 1 MiB"); return; }
      setAttachmentContent(extracted);
      setAttachmentSource(extension === "tex" ? `${file.name} · 已转换为 Markdown` : `${file.name} · 已提取`);
      if (!attachmentTitle.trim()) setAttachmentTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setAttachmentError("无法读取这个文件，请确认它是文本文件");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const body = serializeEditor(editor).trim();
    const usedIds = new Set(Array.from(body.matchAll(attachmentMarkerPattern()), (match) => match[1].toLocaleLowerCase()));
    const included = attachments.filter((attachment) => usedIds.has(attachment.draftId.toLocaleLowerCase()));
    if (!body || (!body.replace(attachmentMarkerPattern(), "").trim() && !included.length)) return;
    if (included.length !== usedIds.size) { setError("附件位置已经失效，请删除后重新插入"); return; }
    setSending(true);
    setError("");
    try {
      const sent = await onSubmit({ body, attachments: included });
      if (!sent) return;
      editor.replaceChildren();
      setSerialized("");
      setAttachments([]);
      savedRangeRef.current = null;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-attachment-id]") : null;
    if (target?.dataset.attachmentId) openExistingAttachment(target.dataset.attachmentId);
    else updateCaretPosition();
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-attachment-id]") : null;
    if (target?.dataset.attachmentId && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openExistingAttachment(target.dataset.attachmentId);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!editorRef.current) return;
    insertPlainText(editorRef.current, event.clipboardData.getData("text/plain"));
    syncEditor();
    updateCaretPosition();
  }

  const hasContent = Boolean(serialized.replace(attachmentMarkerPattern(), "").trim() || attachments.length);
  return (
    <form className={`message-composer${compact ? " compact" : ""}`} onSubmit={submit}>
      {!compact && <MemberAvatar avatarUpdatedAt={avatarUpdatedAt} className="message-avatar" initials={initials} memberId={memberId} />}
      <div className="message-editor-wrap" data-focused={editorFocused ? "true" : "false"} ref={editorWrapRef}>
        <div
          aria-label={placeholder}
          aria-multiline="true"
          className="message-editor"
          contentEditable
          data-empty={hasContent ? "false" : "true"}
          data-placeholder={placeholder}
          onClick={handleEditorClick}
          onBlur={() => setEditorFocused(false)}
          onFocus={() => { setEditorFocused(true); updateCaretPosition(); }}
          onInput={() => { syncEditor(); updateCaretPosition(); }}
          onKeyDown={handleEditorKeyDown}
          onKeyUp={updateCaretPosition}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
        {allowAttachments && editorFocused && <button
          aria-label="在光标处添加 Markdown 附件"
          className="caret-add-button"
           disabled={attachments.length >= MAX_MESSAGE_ATTACHMENTS}
           onMouseDown={(event) => event.preventDefault()}
           onPointerDown={(event) => event.preventDefault()}
           onClick={openNewAttachment}
          style={{ left: caretPosition.left, top: caretPosition.top }}
          type="button"
        ><Plus aria-hidden="true" size={14} /></button>}
      </div>
      <button disabled={!hasContent || sending} type="submit"><Send aria-hidden="true" size={14} /><span>{sending ? "发送中…" : compact ? "回复" : "发送"}</span></button>
      {error && <p className="message-composer-error" role="alert">{error}</p>}

      {allowAttachments && dialogOpen && <div className="attachment-dialog-backdrop">
        <section aria-labelledby="attachment-dialog-title" aria-modal="true" className="attachment-dialog" role="dialog">
          <header><div><h2 id="attachment-dialog-title">{editingId ? "编辑附件" : "插入附件"}</h2><p>附件会以弱化的下划线标题插入当前光标位置。</p></div><button aria-label="关闭" onClick={() => setDialogOpen(false)} type="button"><X aria-hidden="true" size={16} /></button></header>
          <label><span>标题</span><input maxLength={MAX_MESSAGE_ATTACHMENT_TITLE} onChange={(event) => setAttachmentTitle(event.target.value)} placeholder="例如：完整证明" ref={titleInputRef} value={attachmentTitle} /></label>
          <label className="attachment-content-field"><span>Markdown 文本</span><textarea onChange={(event) => setAttachmentContent(event.target.value)} placeholder="在这里粘贴 Markdown 文本，或从文件中提取" rows={13} value={attachmentContent} /></label>
          <input accept=".txt,.md,.tex,text/plain,text/markdown,application/x-tex" className="sr-only" onChange={(event) => void extractFile(event.target.files?.[0])} ref={fileInputRef} type="file" />
          {attachmentError && <p className="attachment-dialog-error" role="alert">{attachmentError}</p>}
          <footer>
            <button className="attachment-file-button" onClick={() => fileInputRef.current?.click()} type="button"><FileUp aria-hidden="true" size={14} />从文件提取</button>
            <span className="attachment-source-label">{attachmentSource || "支持 txt、md、tex"}</span>
            {editingId && <button className="danger" onClick={removeAttachment} type="button"><Trash2 aria-hidden="true" size={14} />删除附件</button>}
            <button onClick={() => setDialogOpen(false)} type="button">取消</button>
            <button onClick={saveAttachment} type="button"><FileText aria-hidden="true" size={14} />确认插入</button>
          </footer>
        </section>
      </div>}
    </form>
  );
}
