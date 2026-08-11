# 邮箱验证码独立投递测试

这一测试只验证“生成验证码邮件并投递到收件箱”的通道，不会启动网站、写入数据库或修改注册流程。

## 1. 准备 Resend 测试密钥

在 Resend 创建一个仅有 **Sending access** 的 API key。首次联调可以暂不配置自己的域名，使用 Resend 的测试发件地址；这种模式只能投递到创建 Resend 账户时使用的邮箱。

在项目根目录创建不会被 Git 提交的 `.dev.vars`：

```dotenv
RESEND_API_KEY="re_xxxxxxxxx"
EMAIL_FROM="丐院 <onboarding@resend.dev>"
EMAIL_TEST_TO="your-resend-account@example.com"
```

不要把真实 API key 写进源码、README、聊天消息或提交记录。

## 2. 先跑无网络单元测试

```bash
npm run test:email
```

测试会用本地模拟响应检查邮件正文、Resend 请求格式、幂等键、输入校验和错误信息脱敏，不会真的发送邮件。

## 3. 发一封真实测试邮件

```bash
npm run email:test
```

命令成功后会显示 Resend 邮件 ID 和本次六位验证码。检查收件箱与垃圾邮件目录，确认邮件中的验证码一致。

也可以不配置 `EMAIL_TEST_TO`，改为临时传入收件地址：`npm run email:test -- your-resend-account@example.com`。

如需固定验证码以便反复检查模板，可在 `.dev.vars` 临时加入：

```dotenv
EMAIL_TEST_CODE="123456"
```

## 4. 换成正式发件域名

在 Resend 中添加自己拥有的域名或专用子域名（例如 `mail.example.com`），按其提示配置 SPF、DKIM 等 DNS 记录并等待验证通过，然后把配置改为：

```dotenv
EMAIL_FROM="丐院 <verify@mail.example.com>"
```

正式部署时，`RESEND_API_KEY` 应保存为 Cloudflare Worker Secret，`EMAIL_FROM` 可保存为普通环境变量。网站注册流程已经接入验证码的哈希存储、10 分钟过期、重发限流、最多 5 次校验和一次性消费；发送前还会先校验邀请码及注册邮箱白名单。
