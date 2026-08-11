import { randomInt, randomUUID } from "node:crypto";
import { sendVerificationEmail } from "../email/verification-email.ts";

const recipient = process.argv[2]?.trim() || process.env.EMAIL_TEST_TO?.trim();
const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
const from = process.env.EMAIL_FROM?.trim() || "丐院 <onboarding@resend.dev>";
const endpoint = process.env.RESEND_API_ENDPOINT?.trim() || undefined;
const configuredCode = process.env.EMAIL_TEST_CODE?.trim();
const code = configuredCode || randomInt(0, 1_000_000).toString().padStart(6, "0");

if (!recipient) {
  console.error("请在 .dev.vars 中配置 EMAIL_TEST_TO，或使用：npm run email:test -- <收件邮箱>");
  process.exitCode = 1;
} else {
  try {
    const result = await sendVerificationEmail(
      { apiKey, from, endpoint },
      { to: recipient, code, requestId: randomUUID(), expiresInMinutes: 10 },
    );
    console.log("发送请求成功，收件地址已隐藏");
    console.log(`Resend 邮件 ID：${result.id}`);
    console.log(`本次测试验证码：${code}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "发送测试邮件失败");
    process.exitCode = 1;
  }
}
