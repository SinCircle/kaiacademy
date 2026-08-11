const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";

export type VerificationEmailConfig = {
  apiKey: string;
  from: string;
  endpoint?: string;
};

export type VerificationEmailInput = {
  to: string;
  code: string;
  requestId: string;
  expiresInMinutes?: number;
};

type FetchLike = typeof fetch;

type ResendResponse = {
  id?: unknown;
  message?: unknown;
  name?: unknown;
};

export class VerificationEmailError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "VerificationEmailError";
    this.status = status;
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function normalizedExpiry(value: number | undefined) {
  const minutes = value ?? 10;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    throw new VerificationEmailError("验证码有效期必须是 1 到 60 分钟的整数", 400);
  }
  return minutes;
}

export function renderVerificationEmail(code: string, expiresInMinutes?: number) {
  if (!/^\d{6}$/.test(code)) {
    throw new VerificationEmailError("验证码必须是 6 位数字", 400);
  }

  const minutes = normalizedExpiry(expiresInMinutes);
  const safeCode = escapeHtml(code);
  const subject = `${code} 是你的丐院邮箱验证码`;
  const text = [
    "丐院邮箱验证",
    "",
    `你的验证码是：${code}`,
    `验证码将在 ${minutes} 分钟后失效。`,
    "",
    "如果不是你本人发起的操作，请忽略此邮件。请勿把验证码告诉任何人。",
  ].join("\n");
  const html = `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f4f1ea;color:#171715;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif">
    <div style="box-sizing:border-box;max-width:560px;margin:40px auto;padding:40px;background:#fff;border:1px solid #d9d4c9">
      <div style="margin-bottom:28px;font-family:Georgia,'Times New Roman',serif;font-size:22px">丐院</div>
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:600">验证你的邮箱</h1>
      <p style="margin:0 0 24px;color:#625f58;font-size:14px;line-height:1.7">请在注册页面输入以下验证码：</p>
      <div style="margin:0 0 24px;padding:18px 20px;background:#f4f1ea;letter-spacing:10px;text-align:center;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:32px;font-weight:700">${safeCode}</div>
      <p style="margin:0 0 8px;color:#625f58;font-size:13px;line-height:1.7">验证码将在 ${minutes} 分钟后失效。</p>
      <p style="margin:0;color:#8b877f;font-size:12px;line-height:1.7">如果不是你本人发起的操作，请忽略此邮件。请勿把验证码告诉任何人。</p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

function parseResponse(body: string): ResendResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as ResendResponse;
  } catch {
    return {};
  }
}

function providerMessage(payload: ResendResponse) {
  if (typeof payload.message !== "string") return "邮件服务没有返回错误详情";
  return payload.message.replace(/[\r\n]+/g, " ").slice(0, 300);
}

export async function sendVerificationEmail(
  config: VerificationEmailConfig,
  input: VerificationEmailInput,
  fetchImpl: FetchLike = fetch,
) {
  const apiKey = config.apiKey.trim();
  const from = config.from.trim();
  const to = input.to.trim().toLocaleLowerCase();
  const requestId = input.requestId.trim();

  if (!apiKey) throw new VerificationEmailError("缺少 RESEND_API_KEY", 500);
  if (!from) throw new VerificationEmailError("缺少 EMAIL_FROM", 500);
  if (!isEmail(to)) throw new VerificationEmailError("收件邮箱格式不正确", 400);
  if (!requestId || requestId.length > 220) {
    throw new VerificationEmailError("邮件请求 ID 不正确", 400);
  }

  const content = renderVerificationEmail(input.code, input.expiresInMinutes);
  const response = await fetchImpl(config.endpoint ?? RESEND_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `email-verification/${requestId}`,
      "User-Agent": "gaiyuan/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [{ name: "category", value: "email_verification" }],
    }),
  });

  const payload = parseResponse(await response.text());
  if (!response.ok) {
    throw new VerificationEmailError(
      `邮件服务拒绝发送（HTTP ${response.status}）：${providerMessage(payload)}`,
      response.status,
    );
  }
  if (typeof payload.id !== "string" || !payload.id) {
    throw new VerificationEmailError("邮件服务返回了无效的邮件 ID", 502);
  }

  return { id: payload.id, to };
}
