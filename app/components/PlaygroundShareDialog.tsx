"use client";

import { CalendarDays, Check, Copy, Download, Eye, FileText, UserRound, X } from "lucide-react";
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import { useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { MarkdownTitle } from "./MarkdownTitle";

type SharePost = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
};

const ink = "#1d1d1b";
const ground = "#f1f1ed";

function plainMarkdown(source: string) {
  return source
    .replace(/```(?:[^\n]*)\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_~`$]/g, "")
    .trim();
}

function publicationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function setImageSource(image: HTMLImageElement, source: string) {
  return new Promise<void>((resolve, reject) => {
    if (image.src === source && image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("二维码生成失败"));
    image.src = source;
  });
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function ShareDialog({ foldedNotes, kind, onClose, post }: {
  foldedNotes: string[];
  kind: "playground" | "problem";
  onClose(): void;
  post: SharePost;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const qrRef = useRef<HTMLImageElement>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [showDate, setShowDate] = useState(true);
  const [showAuthor, setShowAuthor] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"" | "copy" | "image">("");
  const [message, setMessage] = useState("");
  const [viewImage, setViewImage] = useState("");

  async function ensureShareUrl() {
    if (shareUrl) return shareUrl;
    const response = await fetch(`/api/${kind === "problem" ? "problems" : "playground"}/${post.id}/share`, { method: "POST" });
    const payload = await response.json() as { message?: string; token?: string };
    if (!response.ok || !payload.token) throw new Error(payload.message ?? "无法创建分享链接");
    const next = `${window.location.origin}/${kind === "problem" ? "problems" : "playground"}/${post.id}?share=${encodeURIComponent(payload.token)}`;
    setShareUrl(next);
    return next;
  }

  async function copyLink() {
    if (busy) return;
    setBusy("copy");
    setMessage("");
    try {
      await navigator.clipboard.writeText(await ensureShareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法复制分享链接");
    } finally {
      setBusy("");
    }
  }

  async function createImage() {
    const card = cardRef.current;
    const qr = qrRef.current;
    if (!card || !qr) throw new Error("分享图片尚未准备完成");
    const url = await ensureShareUrl();
    const qrSource = await QRCode.toDataURL(url, {
      width: 168,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: ink, light: "#ffffff" },
    });
    await setImageSource(qr, qrSource);
    await document.fonts.ready;
    await nextPaint();
    return toPng(card, {
      backgroundColor: ground,
      cacheBust: true,
      pixelRatio: 2,
      skipAutoScale: false,
    });
  }

  async function downloadImage() {
    if (busy) return;
    setBusy("image");
    setMessage("");
    try {
      const source = await createImage();
      const link = document.createElement("a");
      link.download = `gaiyuan-${kind}-${post.id}.png`;
      link.href = source;
      link.click();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法生成分享图片");
    } finally {
      setBusy("");
    }
  }

  async function openImage() {
    if (busy) return;
    setBusy("image");
    setMessage("");
    try {
      setViewImage(await createImage());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法生成分享图片");
    } finally {
      setBusy("");
    }
  }

  return <>
    <div className="playground-share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="playground-share-title" aria-modal="true" className="playground-share-dialog" role="dialog">
        <header><h2 id="playground-share-title">分享内容</h2><button aria-label="关闭" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button></header>
        <div aria-label="分享图附加信息" className="playground-share-options" role="group">
          <span>图片选项：</span>
          <label><input checked={showDate} onChange={(event) => setShowDate(event.target.checked)} type="checkbox" />发布日期</label>
          <label><input checked={showAuthor} onChange={(event) => setShowAuthor(event.target.checked)} type="checkbox" />发布人</label>
        </div>
        <div className="playground-share-actions">
          <button className="secondary-button" disabled={Boolean(busy)} onClick={() => void copyLink()} type="button">{copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}{busy === "copy" ? "创建中…" : copied ? "已复制" : "复制链接"}</button>
          <button className="primary-button playground-share-image-desktop" disabled={Boolean(busy)} onClick={() => void downloadImage()} type="button"><Download aria-hidden="true" size={14} />{busy === "image" ? "生成中…" : "下载图片"}</button>
          <button className="primary-button playground-share-image-mobile" disabled={Boolean(busy)} onClick={() => void openImage()} type="button"><Eye aria-hidden="true" size={14} />{busy === "image" ? "生成中…" : "查看图片"}</button>
        </div>
        {message && <p className="playground-share-message" role="alert">{message}</p>}
      </section>
    </div>

    <div aria-hidden="true" className="playground-share-card-stage">
      <article className="playground-share-card" ref={cardRef}>
        <div className="playground-share-card-paper">
          <div className="playground-share-card-brand"><span>∑</span><strong>丐院</strong></div>
          <h1><MarkdownTitle source={post.title} /></h1>
          {(showDate || showAuthor) && <div className="playground-share-card-metadata">
            {showDate && <span><CalendarDays aria-hidden="true" />{publicationDate(post.createdAt)}</span>}
            {showAuthor && <span><UserRound aria-hidden="true" />{post.authorName}</span>}
          </div>}
          <div className="playground-share-card-divider" />
          <MarkdownContent className="playground-share-card-body" compact source={post.body} />
          {foldedNotes.length > 0 && <div className="playground-share-card-folded"><FileText aria-hidden="true" />{foldedNotes.join(" · ")}</div>}
          <footer><img alt="" ref={qrRef} /></footer>
        </div>
      </article>
    </div>

    {viewImage && <div className="playground-share-image-viewer" role="dialog" aria-label="分享图片">
      <button aria-label="关闭图片" onClick={() => setViewImage("")} type="button"><X aria-hidden="true" size={20} /></button>
      <img alt={`${plainMarkdown(post.title)}的分享图片`} src={viewImage} />
    </div>}
  </>;
}

export function PlaygroundShareDialog({ onClose, post, resourceCount }: {
  onClose(): void;
  post: SharePost;
  resourceCount: number;
}) {
  return <ShareDialog foldedNotes={resourceCount > 0 ? ["资源已折叠"] : []} kind="playground" onClose={onClose} post={post} />;
}

export function ProblemShareDialog({ background, onClose, problem }: {
  background: string;
  onClose(): void;
  problem: SharePost;
}) {
  return <ShareDialog foldedNotes={background.trim() ? ["背景已折叠"] : []} kind="problem" onClose={onClose} post={problem} />;
}
