# 丐院

丐院是一个面向数学研究协作的问题分配与共享系统。问题本身是唯一工作中心：成员通过层级讨论、关系状态与采纳机制共同推进问题，不再额外维护“尝试”、工作流或进度树。

## Docker 本地开发

只需安装 Docker Desktop：

```bash
docker compose up --build
```

打开 `http://localhost:3000`。源码以只读边界之外的普通绑定卷挂入开发容器，依赖、本地 D1 数据和头像对象存储分别保存在 Docker 命名卷中；重启容器不会丢失这些数据。

真实验证码邮件需要在项目根目录创建不提交版本库的 `.dev.vars`：

```dotenv
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=丐院 <verify@your-verified-domain.example>
```

Docker Compose 会在启动时读取它，密钥不会写入镜像。也可以复制 `.dev.vars.example` 后填写。当前 Docker 配置要求该文件真实存在，健康检查也会同时验证邮件配置、头像压缩和头像存储，避免应用启动后才发现关键服务未接通。注册只接受 `mails.ucas.ac.cn`、`gmail.com`、`outlook.com`、`qq.com` 与 `163.com` 邮箱；系统会先验证邀请码，邀请码无效时不会调用邮件服务。

停止服务：

```bash
docker compose down
```

若明确需要删除本地开发数据，再执行：

```bash
docker compose down -v
```

## Docker 生产演练

```bash
docker compose -f compose.prod.yaml up --build -d
```

生产配置使用多阶段镜像，并让构建后的 Worker 包在 workerd 兼容运行时中启动，因此 D1 行为与云端一致。D1 状态单独持久化，适合在上云前验证真实构建产物。云平台若提供托管 D1，应在部署阶段使用平台绑定，而不是搬运本地 `.wrangler` 数据目录。

## 不使用 Docker

需要 Node.js 22.13 或更高版本：

```bash
npm ci
npm run dev
```

正式构建与启动：

```bash
npm run build
npm run start
```

## 开发账号

- 独立超级管理员：`admin@example.com`（仓库中的引导账号为占位数据，无法登录；部署前请配置真实管理员并设置密码）
- 昵称：`SinCircle`

超级管理员可以任命普通管理员。管理员与超级管理员可以管理、置顶和删除问题；只有超级管理员可以管理人员、任命管理员、调整邀请额度或删除人员。删除操作均需要二次确认。

头像上传接受不超过 10 MB 的图片；浏览器框选确认后，服务端会再次压缩成约 100 KB 的 WebP 并写入 `MEDIA` 对象存储。

这是仓库内预设的演示引导数据。注册邀请码为 `MATH-DEMO`（占位符，部署前应替换为随机邀请码）；新成员的默认邀请额度为 0。示例内容作者账号已停用，不能用已知演示密码登录。

## 项目结构

- `app/`：页面、交互组件与 API 路由
- `db/`：D1 数据结构、认证、权限与查询逻辑
- `drizzle/`：正式数据库迁移
- `design/decisions.md`：最终设计目的、哲学与产品决策
- `design/prototype/`：设计阶段归档，不进入 Docker 镜像
- `worker/`：Cloudflare Worker 运行入口
