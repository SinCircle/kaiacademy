import assert from "node:assert/strict";
import test from "node:test";
import { cachedJsonResponse } from "../app/lib/http-cache.ts";

test("returns a stable ETag and a body for a new representation", async () => {
  const response = cachedJsonResponse(new Request("https://kaiacademy.top/api/tags"), { tags: ["数论"] });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("etag") ?? "", /^W\/"[a-z0-9]+-[a-z0-9]+"$/);
  assert.equal(response.headers.get("cache-control"), "private, no-cache");
  assert.deepEqual(await response.json(), { tags: ["数论"] });
});

test("returns only 304 headers when the cached representation is unchanged", async () => {
  const value = { problems: [{ id: "problem-1", title: "测试" }] };
  const first = cachedJsonResponse(new Request("https://kaiacademy.top/api/problems"), value);
  const etag = first.headers.get("etag");
  assert.ok(etag);
  const second = cachedJsonResponse(new Request("https://kaiacademy.top/api/problems", { headers: { "If-None-Match": etag } }), value);
  assert.equal(second.status, 304);
  assert.equal(await second.text(), "");
  assert.equal(second.headers.get("etag"), etag);
});
