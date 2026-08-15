import { env } from "cloudflare:workers";

type SyncController = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();
const subscribers = new Set<SyncController>();

function configuredUrl(name: "SYNC_PUBLISH_URL" | "SYNC_STREAM_URL") {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.startsWith("http") ? value : "";
}

export function syncStreamUrl() {
  return configuredUrl("SYNC_STREAM_URL");
}

export async function publishSyncInvalidation(prefixes: string[]) {
  const unique = [...new Set(prefixes.filter(Boolean))];
  if (!unique.length) return;
  const endpoint = configuredUrl("SYNC_PUBLISH_URL");
  if (endpoint) {
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: unique }),
      });
    } catch {
      // The mutation has already succeeded. A temporary sync outage must not roll it back.
    }
    return;
  }
  const chunk = encoder.encode(`event: invalidate\ndata: ${JSON.stringify({ prefixes: unique })}\n\n`);
  for (const controller of subscribers) {
    try {
      controller.enqueue(chunk);
    } catch {
      subscribers.delete(controller);
    }
  }
}

export function createSyncStream(signal: AbortSignal) {
  let controller: SyncController | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const close = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (controller) subscribers.delete(controller);
    controller = null;
  };
  signal.addEventListener("abort", close, { once: true });
  return new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
      subscribers.add(next);
      next.enqueue(encoder.encode("retry: 3000\nevent: ready\ndata: {}\n\n"));
      heartbeat = setInterval(() => {
        try { next.enqueue(encoder.encode(": keepalive\n\n")); } catch { close(); }
      }, 25_000);
    },
    cancel: close,
  });
}
