"use client";

import Link from "next/link";
import { Bell, LogIn, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clearSessionCache, useSession } from "../hooks/useSession";
import { relativeTime } from "../lib/format";
import { BrandLogo } from "./BrandLogo";
import { MemberAvatar } from "./MemberAvatar";

type ActivePage = "home" | "problems" | "profile" | "admin" | "login";

type NotificationGroup = {
  problemId: string;
  problemTitle: string;
  problemShortCode: string;
  latestSummary: string;
  latestAt: string;
  unreadCount: number;
  totalCount: number;
};

export function SiteHeader({ active }: { active: ActivePage }) {
  const { member, loading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ items: NotificationGroup[]; unreadCount: number }>({ items: [], unreadCount: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!member) return;
    fetch("/api/notifications", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { items?: NotificationGroup[]; unreadCount?: number }) => setNotifications({
        items: data.items ?? [],
        unreadCount: data.unreadCount ?? 0,
      }))
      .catch(() => undefined);
  }, [member]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function openProblem(item: NotificationGroup) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problemId: item.problemId }),
    }).catch(() => undefined);
    window.location.assign(`/problems/${item.problemId}`);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearSessionCache();
    window.location.assign("/");
  }

  return (
    <header className="site-header">
      <BrandLogo />

      <nav className="site-nav" aria-label="主要导航">
        <Link className={active === "problems" ? "active" : ""} href="/problems" aria-current={active === "problems" ? "page" : undefined}>难题</Link>
        {member && <Link className={active === "profile" ? "active" : ""} href="/profile" aria-current={active === "profile" ? "page" : undefined}>个人</Link>}
        {(member?.role === "admin" || member?.role === "superadmin") && <Link className={active === "admin" ? "active" : ""} href="/admin/problems" aria-current={active === "admin" ? "page" : undefined}>管理</Link>}
      </nav>

      <div className="header-actions">
        {member ? (
          <>
            <div className="notification-control" ref={menuRef}>
              <button
                aria-expanded={menuOpen}
                aria-label={`问题动态，${notifications.unreadCount} 条未读`}
                className="notification-button"
                onClick={() => setMenuOpen((open) => !open)}
                type="button"
              >
                <Bell aria-hidden="true" size={16} />
                {notifications.unreadCount > 0 && <span>{notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}</span>}
              </button>
              {menuOpen && (
                <section className="notification-menu" aria-label="问题动态">
                  <header><b>问题动态</b><span>{notifications.unreadCount} 条未读</span></header>
                  <div>
                    {notifications.items.map((item) => (
                      <button className={item.unreadCount ? "unread" : ""} key={item.problemId} onClick={() => void openProblem(item)} type="button">
                        <span><code>{item.problemShortCode}</code>{item.unreadCount > 0 && <i>{item.unreadCount}</i>}</span>
                        <b>{item.problemTitle}</b>
                        <small>{item.latestSummary}</small>
                        <time>{relativeTime(item.latestAt)}</time>
                      </button>
                    ))}
                    {!notifications.items.length && <p>暂时没有新的问题动态。</p>}
                  </div>
                </section>
              )}
            </div>
            <Link className="member-link" href="/profile" aria-label={`${member.displayName}的个人页`}>
              {member.avatarUpdatedAt ? <MemberAvatar avatarUpdatedAt={member.avatarUpdatedAt} className="header-member-avatar" initials={member.initials} memberId={member.id} /> : <UserRound aria-hidden="true" size={15} />}<span className="member-name">{member.displayName}</span>
            </Link>
            <button className="logout-button" onClick={() => void signOut()} type="button" aria-label="退出登录"><LogOut aria-hidden="true" size={15} /></button>
          </>
        ) : !loading ? (
          <Link className={`login-link ${active === "login" ? "active" : ""}`} href="/login">登录 <LogIn aria-hidden="true" size={14} /></Link>
        ) : <span className="header-loading" aria-hidden="true" />}
      </div>
    </header>
  );
}
