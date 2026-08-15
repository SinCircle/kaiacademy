import assert from "node:assert/strict";
import test from "node:test";
import { buildHomeFeed, NEW_MEMBER_PIN_WINDOW_MS } from "../app/lib/home-feed.ts";

function item(id, updatedAt, isPinned = false) {
  return { id, updatedAt, isPinned };
}

test("anonymous and new members retain pinned homepage items", () => {
  const now = Date.parse("2026-08-15T08:00:00.000Z");
  const problems = [item("fresh", "2026-08-15T07:59:00.000Z"), item("guide", "2026-08-10T00:00:00.000Z", true)];
  assert.deepEqual(buildHomeFeed(problems, [], null, now).map(({ item: entry }) => entry.id), ["guide", "fresh"]);
  assert.deepEqual(buildHomeFeed(problems, [], new Date(now - NEW_MEMBER_PIN_WINDOW_MS).toISOString(), now).map(({ item: entry }) => entry.id), ["guide", "fresh"]);
});

test("established signed-in members hide pinned items and mix both modules by update time", () => {
  const now = Date.parse("2026-08-15T08:00:00.000Z");
  const problems = [item("problem", "2026-08-15T07:40:00.000Z"), item("guide", "2026-08-15T07:59:00.000Z", true)];
  const playground = [item("post", "2026-08-15T07:50:00.000Z"), item("pinned-post", "2026-08-15T07:58:00.000Z", true)];
  const result = buildHomeFeed(problems, playground, new Date(now - NEW_MEMBER_PIN_WINDOW_MS - 1).toISOString(), now);
  assert.deepEqual(result.map(({ kind, item: entry }) => `${kind}:${entry.id}`), ["playground:post", "problem:problem"]);
});
