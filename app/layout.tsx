import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import { CacheSync } from "./components/CacheSync";
import { SessionProvider } from "./hooks/useSession";
import { currentMember } from "../db/auth";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "共同推进尚未解决的数学问题。";

  return {
    metadataBase: new URL(origin),
    title: { default: "丐院", template: "%s · 丐院" },
    description,
    icons: {
      icon: [
        { url: "/favicon.ico?v=3", type: "image/x-icon" },
        { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      ],
      shortcut: ["/favicon.ico?v=3"],
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "丐院",
      title: "丐院",
      description,
      images: [{ url: `${origin}/og.png`, width: 1728, height: 909, alt: "丐院：共同推进尚未解决的数学问题" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "丐院",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const initialMember = await currentMember(new Request("http://localhost/", {
    headers: { cookie: requestHeaders.get("cookie") ?? "" },
  }));

  return <html lang="zh-CN"><body><SessionProvider initialMember={initialMember}><CacheSync />{children}<footer className="site-footer"><span>© 2026 丐院</span><span>共同推进尚未解决的数学问题</span></footer></SessionProvider></body></html>;
}
