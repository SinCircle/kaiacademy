import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PLAYGROUND_UPLOAD_BYTES,
  PLAYGROUND_COMMENT_MARKERS,
  PLAYGROUND_VIEW_WINDOW_MS,
  comparePlaygroundCommentRank,
  isPlaygroundCommentMarker,
  playgroundViewWindowStart,
  normalizeExternalResourceUrl,
  resourceExtension,
  validatePlaygroundUpload,
} from "../app/lib/playground.ts";

test("accepts ordinary resource files and extracts their format", () => {
  assert.equal(resourceExtension("notes.Final.PDF"), "pdf");
  assert.equal(validatePlaygroundUpload({ name: "notes.pdf", size: 1024, type: "application/pdf" }), null);
});

test("rejects executable, empty and oversized uploads", () => {
  assert.match(validatePlaygroundUpload({ name: "run.exe", size: 1024, type: "application/octet-stream" }), /不支持/);
  assert.match(validatePlaygroundUpload({ name: "empty.md", size: 0, type: "text/markdown" }), /空文件/);
  assert.match(validatePlaygroundUpload({ name: "large.zip", size: MAX_PLAYGROUND_UPLOAD_BYTES + 1, type: "application/zip" }), /10 MB/);
});

test("external resources accept only sanitized HTTP and HTTPS URLs", () => {
  assert.equal(normalizeExternalResourceUrl("javascript:alert(1)"), null);
  assert.equal(normalizeExternalResourceUrl("ftp://example.com/file.zip"), null);
  assert.equal(normalizeExternalResourceUrl("https://user:secret@example.com/file.zip"), "https://example.com/file.zip");
});

test("supports the configured public emoji comment markers", () => {
  assert.deepEqual(PLAYGROUND_COMMENT_MARKERS.map((option) => option.emoji), ["👍", "❤️", "😂", "😮", "😢", "👏", "💡", "🎉", "👀", "🤝", "✅", "❓", "🚀", "🔥", "🤔", "🧠"]);
  assert.equal(isPlaygroundCommentMarker("💡"), true);
  assert.equal(isPlaygroundCommentMarker("🛸"), false);
  assert.equal(isPlaygroundCommentMarker(null), false);
});

test("deduplicates views within a window and ranks featured comments first", () => {
  const timestamp = Date.parse("2026-08-13T12:00:00.000Z");
  assert.equal(playgroundViewWindowStart(timestamp), "2026-08-13T12:00:00.000Z");
  assert.equal(playgroundViewWindowStart(timestamp + PLAYGROUND_VIEW_WINDOW_MS - 1), "2026-08-13T12:00:00.000Z");
  assert.equal(playgroundViewWindowStart(timestamp + PLAYGROUND_VIEW_WINDOW_MS), "2026-08-13T12:30:00.000Z");
  const ordinary = { isFeatured: false, upvotes: 100, createdAt: "2026-08-13T10:00:00.000Z" };
  const featured = { isFeatured: true, upvotes: 0, createdAt: "2026-08-13T11:00:00.000Z" };
  assert.ok(comparePlaygroundCommentRank(featured, ordinary) < 0);
});
