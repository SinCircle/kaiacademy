import { env } from "cloudflare:workers";
import { AppError } from "./errors";

export const MAX_AVATAR_UPLOAD_BYTES = 10 * 1024 * 1024;
export const TARGET_AVATAR_BYTES = 120 * 1024;

type ImageTransform = {
  transform(options: Record<string, unknown>): ImageTransform;
  output(options: { format: string; quality: number; anim?: boolean }): Promise<{ response(): Response }>;
};

type ImagesBinding = {
  input(stream: ReadableStream): ImageTransform;
};

export type MediaObject = {
  body: ReadableStream;
  size: number;
  httpEtag: string;
};

type MediaBucket = {
  get(key: string): Promise<MediaObject | null>;
  put(key: string, value: ArrayBuffer, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

type MediaEnvironment = {
  IMAGES?: ImagesBinding;
  MEDIA?: MediaBucket;
};

export function mediaBucket() {
  const bucket = (env as unknown as MediaEnvironment).MEDIA;
  if (!bucket) throw new AppError("头像存储尚未配置", 503);
  return bucket;
}

export function imageProcessor() {
  const images = (env as unknown as MediaEnvironment).IMAGES;
  if (!images) throw new AppError("服务端图片压缩尚未配置", 503);
  return images;
}

export async function compressAvatar(file: File) {
  if (file.size <= 0 || file.size > MAX_AVATAR_UPLOAD_BYTES) throw new AppError("头像图片不能超过 10 MB");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new AppError("头像仅支持 JPEG、PNG 或 WebP 图片");

  const images = imageProcessor();
  const source = await file.arrayBuffer();
  let best: ArrayBuffer | null = null;

  for (const quality of [78, 64, 50, 38]) {
    const transformed = await images
      .input(new Blob([source], { type: file.type }).stream())
      .transform({ width: 512, height: 512, fit: "cover" })
      .output({ format: "image/webp", quality, anim: false });
    const response = transformed.response();
    if (!response.ok) throw new AppError("无法解析这张图片，请换一张重试");
    best = await response.arrayBuffer();
    if (best.byteLength <= TARGET_AVATAR_BYTES) break;
  }

  if (!best || best.byteLength > 160 * 1024) throw new AppError("图片压缩后仍然过大，请换一张重试");
  return best;
}
