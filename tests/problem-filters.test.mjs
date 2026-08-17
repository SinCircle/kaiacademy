import assert from "node:assert/strict";
import test from "node:test";
import { matchesAttentionCount } from "../app/lib/problem-filters.ts";

test("attention-count filters form the requested non-overlapping ranges", () => {
  assert.equal(matchesAttentionCount(2, "2"), true);
  assert.equal(matchesAttentionCount(3, "3"), true);
  assert.equal(matchesAttentionCount(4, "4"), true);
  assert.equal(matchesAttentionCount(5, "5to20"), true);
  assert.equal(matchesAttentionCount(19, "5to20"), true);
  assert.equal(matchesAttentionCount(20, "5to20"), false);
  assert.equal(matchesAttentionCount(20, "20plus"), true);
  assert.equal(matchesAttentionCount(21, "20plus"), true);
});
