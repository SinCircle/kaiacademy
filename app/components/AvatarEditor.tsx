"use client";

import { ImagePlus, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PREVIEW_SIZE = 320;
const OUTPUT_SIZE = 512;

type Point = { x: number; y: number };

function imageScale(image: HTMLImageElement, zoom: number) {
  return Math.max(PREVIEW_SIZE / image.naturalWidth, PREVIEW_SIZE / image.naturalHeight) * zoom;
}

function clampCenter(image: HTMLImageElement, zoom: number, center: Point) {
  const scale = imageScale(image, zoom);
  const halfSource = PREVIEW_SIZE / (2 * scale);
  return {
    x: Math.min(Math.max(center.x, halfSource), image.naturalWidth - halfSource),
    y: Math.min(Math.max(center.y, halfSource), image.naturalHeight - halfSource),
  };
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成裁剪图片")), "image/webp", 0.92);
  });
}

export function AvatarEditor({ onUploaded }: { onUploaded(updatedAt: string): Promise<void> | void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [center, setCenter] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    setImage(null);
    setMessage("");
    setZoom(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
  }, []);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;
    const scale = imageScale(image, zoom);
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.fillStyle = "#f2f2ee";
    context.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.drawImage(
      image,
      PREVIEW_SIZE / 2 - center.x * scale,
      PREVIEW_SIZE / 2 - center.y * scale,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
  }, [center, image, zoom]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    if (!file.type.startsWith("image/")) { setMessage("请选择图片文件"); return; }
    if (file.size > MAX_FILE_BYTES) { setMessage("图片不能超过 10 MB"); return; }
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;
    const next = new Image();
    next.onload = () => {
      if (next.naturalWidth * next.naturalHeight > 50_000_000) {
        setMessage("图片像素过大，请换一张尺寸更小的图片");
        URL.revokeObjectURL(url);
        sourceUrlRef.current = null;
        return;
      }
      setZoom(1);
      setCenter({ x: next.naturalWidth / 2, y: next.naturalHeight / 2 });
      setImage(next);
    };
    next.onerror = () => {
      setMessage("无法读取这张图片");
      URL.revokeObjectURL(url);
      sourceUrlRef.current = null;
    };
    next.src = url;
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!image || !dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    const scale = imageScale(image, zoom);
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setCenter((current) => clampCenter(image, zoom, { x: current.x - dx / scale, y: current.y - dy / scale }));
  }

  async function confirm() {
    if (!image) return;
    setSaving(true);
    setMessage("");
    try {
      const output = document.createElement("canvas");
      output.width = OUTPUT_SIZE;
      output.height = OUTPUT_SIZE;
      const context = output.getContext("2d");
      if (!context) throw new Error("浏览器无法裁剪图片");
      const scale = imageScale(image, zoom);
      const sourceSize = PREVIEW_SIZE / scale;
      const sourceX = Math.min(Math.max(center.x - sourceSize / 2, 0), image.naturalWidth - sourceSize);
      const sourceY = Math.min(Math.max(center.y - sourceSize / 2, 0), image.naturalHeight - sourceSize);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await canvasBlob(output);
      const response = await fetch("/api/avatar", { method: "POST", body: blob, headers: { "Content-Type": "image/webp" } });
      const result = await response.json() as { message?: string; updatedAt?: string };
      if (!response.ok || !result.updatedAt) throw new Error(result.message ?? "头像上传失败");
      await onUploaded(result.updatedAt);
      close();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "头像上传失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <input accept="image/*" className="sr-only" onChange={choose} ref={inputRef} type="file" />
      <button className="avatar-select-button" onClick={() => inputRef.current?.click()} type="button"><ImagePlus aria-hidden="true" size={13} />更换头像</button>
      {message && !image && <small className="avatar-inline-error">{message}</small>}
      {image && <div className="avatar-crop-backdrop">
        <section aria-labelledby="avatar-crop-title" aria-modal="true" className="avatar-crop-dialog" role="dialog">
          <header><div><h2 id="avatar-crop-title">框选头像</h2><p>拖动图片调整位置，确认后才会替换当前头像。</p></div><button aria-label="关闭" disabled={saving} onClick={close} type="button"><X aria-hidden="true" size={16} /></button></header>
          <div className="avatar-crop-stage"><canvas
            height={PREVIEW_SIZE}
            onPointerCancel={() => { dragRef.current = null; }}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; }}
            onPointerMove={move}
            onPointerUp={() => { dragRef.current = null; }}
            ref={canvasRef}
            width={PREVIEW_SIZE}
          /><span aria-hidden="true" /></div>
          <label className="avatar-zoom"><Minus aria-hidden="true" size={13} /><span className="sr-only">缩放头像</span><input max={3} min={1} onChange={(event) => { const nextZoom = Number(event.target.value); setZoom(nextZoom); setCenter((current) => clampCenter(image, nextZoom, current)); }} step={0.01} type="range" value={zoom} /><Plus aria-hidden="true" size={13} /></label>
          <p className="form-message" aria-live="polite">{message}</p>
          <footer><button disabled={saving} onClick={close} type="button">取消</button><button disabled={saving} onClick={() => void confirm()} type="button">{saving ? "压缩并保存中…" : "确认使用"}</button></footer>
        </section>
      </div>}
    </>
  );
}
