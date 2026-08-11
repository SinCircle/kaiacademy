import { env } from "cloudflare:workers";
import { VerificationEmailError } from "../../../../email/verification-email";
import { AppError } from "../../../../db/errors";
import { requestRegistrationCode } from "../../../../db/verification";
import { apiError, assertSameOrigin } from "../../_shared";

type EmailEnvironment = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  RESEND_API_ENDPOINT?: string;
};

function emailConfig() {
  const emailEnvironment = env as unknown as EmailEnvironment;
  return {
    apiKey: emailEnvironment.RESEND_API_KEY?.trim() ?? "",
    from: emailEnvironment.EMAIL_FROM?.trim() ?? "",
    endpoint: emailEnvironment.RESEND_API_ENDPOINT?.trim() || undefined,
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as Record<string, unknown>;
    const result = await requestRegistrationCode(payload, emailConfig());
    return Response.json({ ...result, message: "验证码已发送，请检查收件箱和垃圾邮件目录。" });
  } catch (error) {
    if (error instanceof VerificationEmailError) {
      console.error(error);
      return apiError(new AppError(
        error.message.includes("缺少") ? "邮件服务尚未配置，请联系管理员" : "验证码邮件发送失败，请稍后重试",
        error.message.includes("缺少") ? 503 : 502,
      ));
    }
    return apiError(error instanceof SyntaxError ? new AppError("请求信息格式不正确") : error, "验证码邮件发送失败，请稍后重试");
  }
}

export async function HEAD() {
  try {
    const config = emailConfig();
    if (!config.apiKey || !config.from) throw new AppError("邮件服务尚未配置", 503);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error, "邮件服务尚未配置");
  }
}
