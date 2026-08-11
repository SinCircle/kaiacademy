import Link from "next/link";
import { LogIn, Sigma } from "lucide-react";

type ActivePage = "home" | "problems" | "profile" | "login";

const navigation: Array<{ key: ActivePage; label: string; href: string }> = [
  { key: "problems", label: "难题", href: "/problems" },
  { key: "profile", label: "个人", href: "/profile" },
];

export function SiteHeader({ active }: { active: ActivePage }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="丐院首页">
        <span className="wordmark-symbol"><Sigma aria-hidden="true" size={19} strokeWidth={2.4} /></span>
        <span>丐院</span>
      </Link>

      <nav className="site-nav" aria-label="主要导航">
        {navigation.map((item) => (
          <Link
            className={active === item.key ? "active" : ""}
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Link className={`login-link ${active === "login" ? "active" : ""}`} href="/login">
        登录 <LogIn aria-hidden="true" size={14} strokeWidth={2} />
      </Link>
    </header>
  );
}
