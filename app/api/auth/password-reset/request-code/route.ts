import { env } from "cloudflare:workers";
import { VerificationEmailError } from "../../../../../email/verification-email";
import { AppError } from "../../../../../db/errors";
import { requestPasswordResetCode } from "../../../../../db/password-reset";
import { apiError, assertSameOrigin } from "../../../_shared";

type EmailEnvironment = { RESEND_API_KEY?: string; EMAIL_FROM?: string; RESEND_API_ENDPOINT?: string };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const emailEnvironment = env as unknown as EmailEnvironment;
    const payload = await request.json() as Record<string, unknown>;
    const result = await requestPasswordResetCode(payload.email, {
      apiKey: emailEnvironment.RESEND_API_KEY?.trim() ?? "",
      from: emailEnvironment.EMAIL_FROM?.trim() ?? "",
      endpoint: emailEnvironment.RESEND_API_ENDPOINT?.trim() || undefined,
    });
    return Response.json({ ...result, message: "如果该邮箱已注册，验证码将发送至其收件箱。" });
  } catch (error) {
    if (error instanceof VerificationEmailError) {
      console.error(error);
      return apiError(new AppError(error.message.includes("缺少") ? "邮件服务尚未配置，请联系管理员" : "验证码邮件发送失败，请稍后重试", error.message.includes("缺少") ? 503 : 502));
    }
    return apiError(error instanceof SyntaxError ? new AppError("请求信息格式不正确") : error, "验证码邮件发送失败，请稍后重试");
  }
}
