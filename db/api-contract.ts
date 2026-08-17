export const API_PERMISSIONS = [
  "read",
  "manage_pending_requests",
  "create_problem",
  "update_own_problem",
  "create_direct_message",
  "create_playground_post",
  "update_own_playground_post",
] as const;
export type ApiPermission = (typeof API_PERMISSIONS)[number];
export type ApiWriteAction = Exclude<ApiPermission, "read" | "manage_pending_requests">;

export function normalizeApiPermissions(value: unknown): ApiPermission[] {
  const input = Array.isArray(value) ? value : [];
  const permissions = new Set<ApiPermission>(["read"]);
  for (const permission of input) {
    if (typeof permission === "string" && API_PERMISSIONS.includes(permission as ApiPermission)) permissions.add(permission as ApiPermission);
  }
  // Keys saved before playground reading was merged into `read` use the removed
  // permission as a one-time migration signal. Once the owner saves the form,
  // the new permission list is persisted and can be disabled normally.
  if (input.includes("read_playground")) permissions.add("manage_pending_requests");
  return API_PERMISSIONS.filter((permission) => permissions.has(permission));
}

export function skillMarkdown(name: string, secret: string, baseUrl: string, permissions: ApiPermission[]) {
  return `---
name: gaiyuan-api
description: 使用丐院 API 读取难题与游乐场，并按获准权限提交需要账户所有者批准的内容创建、本人内容修改、难题顶层讨论与游乐场资源请求。
---

# 丐院 API

读取会立即返回结果；所有写入只生成待审阅请求，不会直接修改网站内容。当前 Key 的权限：${permissions.join("、")}。

## 使用限制

- 按权限读取难题或游乐场列表、详情及可见讨论。
- 可以读取当前 Key 已开放的权限。
- 可以按权限读取并撤回当前 Key 自己提交的待处理请求。
- 可以请求创建难题。
- 只能请求修改当前 API Key 所属用户创建的难题。
- 可以请求添加顶层讨论，不能回复已有讨论。
- 可以请求创建游乐场内容、修改本人游乐场内容及附带资源，但不能在游乐场写入讨论或互动。
- 不得操作个人资料、消息、表情、投票、收藏、精选、转让或删除功能。

## 调用规则

所有请求都必须携带：

\`Authorization: Bearer <api key>\`

发送 JSON 时另加 \`Content-Type: application/json\`。下文的 \`{id}\` 是接口返回的难题 \`id\`，不是 \`P-0001\` 形式的展示编号。

请求体只接受各接口列出的字段。数学公式中的反斜杠必须符合 JSON 转义规则；使用命令行时，优先生成 JSON 文件后再提交，格式错误会返回 HTTP \`400\`。

## 当前 Key

### 读取权限开放情况

\`GET ${baseUrl}/api/v1/key/permissions\`

返回当前 Key 的 \`permissions\` 数组。此接口归入基础 \`读取\` 权限，不返回完整 API Key。

## 难题接口

### 搜索或列出难题

\`GET ${baseUrl}/api/v1/problems?q={关键词}\`

读取当前可见的难题列表。\`q\` 可省略；提供时用于搜索标题、正文或标签。返回 \`problems\` 数组，可从中取得后续接口需要的难题 \`id\`。需要 \`读取\` 权限。

### 读取一个难题

\`GET ${baseUrl}/api/v1/problems/{id}\`

读取指定难题的标题、正文、背景、状态、标签、创建者、\`updatedAt\` 版本时间和可见讨论。返回对象位于 \`problem\` 字段。需要 \`读取\` 权限。

### 请求创建难题

\`POST ${baseUrl}/api/v1/problems\`

提交一个新难题供账户所有者审阅。需要 \`创建难题\` 权限。请求体：

\`\`\`json
{
  "title": "必填，标题，最多 140 字",
  "body": "必填，支持 Markdown 与数学公式",
  "background": "选填，问题背景，支持 Markdown 与数学公式",
  "tags": ["必填", "至少一个标签"]
}
\`\`\`

### 请求修改自己的难题

\`PATCH ${baseUrl}/api/v1/problems/{id}\`

提交指定难题的完整新版本供账户所有者审阅。只能修改 API Key 所属用户创建的难题，需要 \`修改自己的难题\` 权限。请求体：

\`\`\`json
{
  "title": "必填，修改后的完整标题",
  "body": "必填，修改后的完整正文",
  "background": "修改后的完整问题背景；没有则传空字符串",
  "tags": ["必填", "修改后的全部标签"],
  "status": "开放",
  "baseUpdatedAt": "必填，读取难题时返回的 updatedAt"
}
\`\`\`

\`status\` 只允许 \`"开放"\` 或 \`"已解决"\`。先读取难题，再提交完整的新版本。如果难题在读取后发生更新，接口会拒绝覆盖并要求重新读取。同一难题同时只能存在一条待处理修改。

### 请求添加顶层讨论

\`POST ${baseUrl}/api/v1/problems/{id}/discussions\`

在指定难题下提交一条新的直接讨论供账户所有者审阅。需要 \`直接讨论\` 权限。请求体：

\`\`\`json
{
  "body": "必填，讨论正文，支持 Markdown 与数学公式"
}
\`\`\`

不要发送 \`parentId\`；此接口不能回复现有讨论。

## 游乐场接口

### 搜索或列出内容

\`GET ${baseUrl}/api/v1/playground?q={关键词}&type={all|post|resource}&tag={标签}&format={格式}&sort={latest|updated|comments|downloads}\`

读取游乐场列表。查询参数均可省略。需要 \`读取\` 权限。

### 读取内容与讨论

\`GET ${baseUrl}/api/v1/playground/{id}\`

读取正文、标签、资源元数据及当前可见讨论；读取不会增加浏览次数或足迹。需要 \`读取\` 权限。

### 下载本站资源

\`GET ${baseUrl}/api/v1/playground/resources/{resourceId}\`

下载详情中 \`kind: "upload"\` 的资源。外链资源直接读取详情返回的 \`externalUrl\`，访问前自行确认风险。需要 \`读取\` 权限。

### 上传到文件隔离区

\`POST ${baseUrl}/api/v1/playground/uploads\`

直接把文件二进制作为请求体发送，同时提供：

- \`Content-Length\`：必填，文件字节数，单文件及单帖本站文件总量均不超过 10 MB。
- \`Content-Type\`：文件 MIME 类型。
- \`X-File-Name\`：经过 URL 编码的文件名。
- \`X-Content-SHA256\`：文件实际内容的 64 位小写十六进制 SHA-256。
- \`X-File-Description\`：可选，经过 URL 编码，最多 240 字。

上传成功返回 \`uploadId\` 与 \`expiresAt\`。文件只在隔离区保留 4 小时，未获批准前不会成为公开资源；请求获批且文件仅被生成的资源引用时，会立即退出隔离区。每个账户隔离区最多占用 50 MB。需要 \`create_playground_post\` 或 \`update_own_playground_post\` 权限。

### 请求创建游乐场内容

\`POST ${baseUrl}/api/v1/playground\`

需要 \`create_playground_post\` 权限。请求体：

\`\`\`json
{
  "title": "必填，最多 160 字",
  "body": "必填，支持 Markdown，API 单次最多 30000 字",
  "tags": ["最多 8 个标签"],
  "uploadIds": ["隔离区文件编号"],
  "externalResources": [{"displayName":"标题","description":"说明","url":"https://example.com/file"}]
}
\`\`\`

一篇内容的本站文件、外链与保留资源合计最多 5 个。

### 请求修改自己的游乐场内容

\`PATCH ${baseUrl}/api/v1/playground/{id}\`

只能修改 Key 所属用户创建的内容，需要 \`update_own_playground_post\` 权限。先读取详情，再提交完整新版本：

\`\`\`json
{
  "title": "修改后的完整标题",
  "body": "修改后的完整正文",
  "tags": ["修改后的全部标签"],
  "keepResourceIds": ["需要保留的现有资源编号"],
  "uploadIds": ["新上传的隔离区文件编号"],
  "externalResources": [{"displayName":"新增外链","description":"说明","url":"https://example.com/file"}],
  "baseUpdatedAt": "读取详情时返回的 updatedAt"
}
\`\`\`

没有要保留或新增的资源时传空数组。内容版本发生变化时接口会拒绝覆盖。同一篇内容同时只能存在一条待处理修改。

## 待处理请求接口

### 读取当前 Key 的待处理请求

\`GET ${baseUrl}/api/v1/requests\`

返回当前 Key 自己提交、仍等待账户所有者处理的请求，包括 \`requestId\`、操作类型、目标编号、完整请求内容和提交时间。需要 \`管理待处理请求\` 权限，不会读取同一账户下其他 Key 的请求。

### 撤回当前 Key 的待处理请求

\`DELETE ${baseUrl}/api/v1/requests/{requestId}\`

将当前 Key 自己提交的待处理请求从队列中撤回；若请求带有隔离文件，会同时清理这些文件。已经批准、拒绝、失败或正在处理的请求不能撤回。需要 \`管理待处理请求\` 权限。

## 写入结果

写入接口成功提交时返回 HTTP \`202\`，以及 \`requestId\`、\`status: "pending"\` 和提示信息。告知用户前往丐院的 API 页面批准或拒绝；在批准前，不得声称内容或资源已经发布或生效。

完全相同的待处理请求会返回原有 \`requestId\`，不会重复创建。一个账户最多保留 64 条待处理请求，达到上限时应等待用户处理，不能继续重试。

不要尝试未开放的接口、未授权权限、修改他人内容或写入游乐场讨论。十分钟内连续三次越界会使当前 API Key 进入“隔离”状态；此时停止调用，并提示用户在 API 页面对应行点击“恢复”。

key name: ${name}
gaiyuan_base_url: ${baseUrl}
api key:${secret}`;
}
