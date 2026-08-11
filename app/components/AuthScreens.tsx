"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { FormEvent, useEffect, useState, type ChangeEvent } from "react";
import { clearSessionCache } from "../hooks/useSession";
import { BrandLogo } from "./BrandLogo";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "登录失败");
      clearSessionCache();
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      window.location.assign(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/problems");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <BrandLogo className="auth-wordmark" />
        <Link href="/problems"><ArrowLeft aria-hidden="true" size={14} />返回难题</Link>
      </header>
      <section className="auth-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-heading"><h1>登录</h1><p>仅限已受邀成员。</p></div>
          <label><span>邮箱</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} /></label>
          <label><span>密码</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" required type="password" value={password} /></label>
          <div className="auth-options"><label><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />保持登录</label><span>忘记密码功能稍后接入</span></div>
          <p className="form-message" aria-live="polite">{message}</p>
          <button className="auth-submit" disabled={submitting} type="submit"><span>{submitting ? "登录中…" : "继续"}</span><ArrowRight aria-hidden="true" size={15} /></button>
          <p className="auth-note">持有邀请码？ <Link href="/register">使用邀请码加入</Link></p>
        </form>
      </section>
    </main>
  );
}

export function RegisterScreen() {
  const [form, setForm] = useState({ inviteCode: "", email: "", emailCode: "", username: "", password: "", confirmPassword: "" });
  const [submitting, setSubmitting] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeMessage, setCodeMessage] = useState("");
  const [message, setMessage] = useState("");

  function field(name: keyof typeof form) {
    return { value: form[name], onChange: (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [name]: event.target.value })) };
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode() {
    setCodeMessage("");
    setCodeSending(true);
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: form.inviteCode, email: form.email }),
      });
      const data = await response.json() as { message?: string; cooldownSeconds?: number };
      if (!response.ok) throw new Error(data.message ?? "暂时无法发送验证码");
      setCodeMessage(data.message ?? "验证码已发送");
      setCooldown(data.cooldownSeconds ?? 60);
    } catch (error) {
      setCodeMessage(error instanceof Error ? error.message : "暂时无法发送验证码");
    } finally {
      setCodeSending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "注册失败");
      clearSessionCache();
      window.location.assign("/profile");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page register-page">
      <header className="auth-header">
        <BrandLogo className="auth-wordmark" />
        <Link href="/login"><ArrowLeft aria-hidden="true" size={14} />返回登录</Link>
      </header>
      <section className="auth-panel register-panel">
        <form className="auth-form register-form" onSubmit={submit}>
          <div className="auth-heading"><h1>创建账户</h1><p>使用有效邀请码加入丐院。新成员默认没有邀请额度。</p></div>
          <label><span>邀请码</span><input {...field("inviteCode")} autoComplete="off" placeholder="输入邀请码" required /></label>
          <label><span>邮箱</span><input {...field("email")} autoComplete="email" placeholder="name@gmail.com" required type="email" /><small>支持国科大邮箱、Gmail、Outlook、QQ 邮箱和 163 邮箱</small></label>
          <label>
            <span>邮箱验证码</span>
            <span className="verification-field"><input {...field("emailCode")} autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="6 位验证码" required /><button disabled={codeSending || cooldown > 0 || !form.inviteCode.trim() || !form.email.trim()} onClick={() => void requestCode()} type="button">{codeSending ? "发送中…" : cooldown > 0 ? `${cooldown}s` : "获取验证码"}</button></span>
            {codeMessage && <small>{codeMessage}</small>}
          </label>
          <label><span>用户名</span><input {...field("username")} autoComplete="username" placeholder="输入用户名" required /></label>
          <label><span>密码</span><input {...field("password")} autoComplete="new-password" minLength={8} placeholder="至少 8 位" required type="password" /></label>
          <label><span>确认密码</span><input {...field("confirmPassword")} autoComplete="new-password" minLength={8} placeholder="再次输入密码" required type="password" /></label>
          <p className="form-message" aria-live="polite">{message}</p>
          <button className="auth-submit" disabled={submitting} type="submit"><span>{submitting ? "创建中…" : "创建账户"}</span><ArrowRight aria-hidden="true" size={15} /></button>
          <p className="auth-note">已有账户？ <Link href="/login">返回登录</Link></p>
        </form>
      </section>
    </main>
  );
}
