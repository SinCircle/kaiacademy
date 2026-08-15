function responseHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function cachedJsonResponse(request: Request, value: unknown) {
  const body = JSON.stringify(value);
  const etag = `W/"${responseHash(body)}-${body.length.toString(36)}"`;
  const headers = new Headers({
    "Cache-Control": "private, no-cache",
    "Content-Type": "application/json; charset=utf-8",
    ETag: etag,
    Vary: "Cookie",
  });
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers });
}
