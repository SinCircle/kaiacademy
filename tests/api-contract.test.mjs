import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiPermissions, skillMarkdown } from "../db/api-contract.ts";

test("API permissions retain read and reject unsupported modules", () => {
  assert.deepEqual(normalizeApiPermissions(["create_problem", "read_playground", "profile", "create_direct_message"]), [
    "read",
    "manage_pending_requests",
    "create_problem",
    "create_direct_message",
  ]);
});

test("API permissions can disable pending-request management after migration", () => {
  assert.deepEqual(normalizeApiPermissions(["read", "create_problem"]), ["read", "create_problem"]);
});

test("downloaded Skill documents guarded playground resources and ends with the reusable key", () => {
  const content = skillMarkdown("research-skill", "gai_sk_live_example", "https://kaiacademy.top", ["read", "manage_pending_requests", "create_playground_post"]);
  assert.match(content, /只能请求修改当前 API Key 所属用户创建的难题/);
  assert.match(content, /不能回复已有讨论/);
  assert.match(content, /不能在游乐场写入讨论或互动/);
  assert.match(content, /搜索或列出难题/);
  assert.match(content, /请求创建难题/);
  assert.match(content, /请求修改自己的难题/);
  assert.match(content, /请求添加顶层讨论/);
  assert.match(content, /读取内容与讨论/);
  assert.match(content, /上传到文件隔离区/);
  assert.match(content, /只在隔离区保留 48 小时/);
  assert.match(content, /请求创建游乐场内容/);
  assert.match(content, /请求修改自己的游乐场内容/);
  assert.match(content, /读取权限开放情况/);
  assert.match(content, /读取当前 Key 的待处理请求/);
  assert.match(content, /撤回当前 Key 的待处理请求/);
  assert.doesNotMatch(content, /read_playground/);
  assert.match(content, /HTTP `202`/);
  assert.match(content, /"background": "选填，问题背景/);
  assert.match(content, /"background": "修改后的完整问题背景/);
  assert.match(content, /"baseUpdatedAt": "必填，读取难题时返回的 updatedAt"/);
  assert.match(content, /一个账户最多保留 64 条待处理请求/);
  assert.match(content, /连续三次越界会使当前 API Key 进入“隔离”状态/);
  assert.match(content, /格式错误会返回 HTTP `400`/);
  assert.match(content, /gaiyuan_base_url: https:\/\/kaiacademy\.top/);
  assert.ok(content.endsWith("api key:gai_sk_live_example"));
});
