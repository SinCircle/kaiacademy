import { createSyncStream, syncStreamUrl } from "../../../db/sync";

export async function GET(request: Request) {
  const upstreamUrl = syncStreamUrl();
  if (upstreamUrl) {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: "text/event-stream" }, signal: request.signal });
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  }
  return new Response(createSyncStream(request.signal), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
