import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sigma } from "lucide-react";

export const metadata: Metadata = {
  title: "注册",
};

export default function RegisterPage() {
  return (
    <main className="login-page register-page">
      <header className="login-header">
        <Link className="login-wordmark" href="/">
          <span><Sigma aria-hidden="true" size={18} strokeWidth={2.3} /></span>
          丐院
        </Link>
        <Link className="back-search" href="/login"><ArrowLeft aria-hidden="true" size={14} />返回登录</Link>
      </header>

      <section className="login-form-panel register-form-panel">
        <form className="login-form register-form" method="post">
          <div className="form-heading">
            <h1>创建账户</h1>
            <p>使用有效邀请码加入丐院。</p>
          </div>

          <label>
            <span>邀请码</span>
            <input name="inviteCode" type="text" placeholder="输入邀请码" autoComplete="off" required />
          </label>

          <label>
            <span>邮箱</span>
            <input name="email" type="email" placeholder="name@example.com" autoComplete="email" required />
          </label>

          <label>
            <span>邮箱验证码</span>
            <span className="verification-input">
              <input name="emailCode" type="text" inputMode="numeric" placeholder="6 位验证码" autoComplete="one-time-code" maxLength={6} required />
              <button type="button">获取验证码</button>
            </span>
          </label>

          <label>
            <span>用户名</span>
            <input name="username" type="text" placeholder="输入用户名" autoComplete="username" required />
          </label>

          <label>
            <span>密码</span>
            <input name="password" type="password" placeholder="至少 8 位" autoComplete="new-password" minLength={8} required />
          </label>

          <label>
            <span>确认密码</span>
            <input name="confirmPassword" type="password" placeholder="再次输入密码" autoComplete="new-password" minLength={8} required />
          </label>

          <p className="register-agreement">注册即表示你同意遵守社区协作规范。</p>
          <button type="submit">创建账户 <ArrowRight aria-hidden="true" size={15} /></button>
          <p className="invite-note">已有账户？ <Link href="/login">返回登录</Link></p>
        </form>
      </section>
    </main>
  );
}
