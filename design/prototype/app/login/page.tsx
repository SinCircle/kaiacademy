import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sigma } from "lucide-react";

export const metadata: Metadata = {
  title: "登录",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <Link className="login-wordmark" href="/problems">
          <span><Sigma aria-hidden="true" size={18} strokeWidth={2.3} /></span>
          丐院
        </Link>
        <Link className="back-search" href="/problems"><ArrowLeft aria-hidden="true" size={14} />返回难题</Link>
      </header>

      <section className="login-form-panel">
        <form className="login-form">
          <div className="form-heading">
            <h1>登录</h1>
            <p>仅限已受邀成员。</p>
          </div>
          <label>
            <span>邮箱</span>
            <input type="email" placeholder="name@example.com" autoComplete="email" />
          </label>
          <label>
            <span>密码</span>
            <input type="password" placeholder="输入密码" autoComplete="current-password" />
          </label>
          <div className="form-options">
            <label><input type="checkbox" /> 保持登录</label>
            <a href="#reset">忘记密码</a>
          </div>
          <button type="submit">继续 <ArrowRight aria-hidden="true" size={15} /></button>
          <p className="invite-note">持有邀请码？ <Link href="/register">使用邀请码加入</Link></p>
        </form>
      </section>
    </main>
  );
}
