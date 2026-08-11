import type { Metadata } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./tagging.css";

export const metadata: Metadata = {
  title: {
    default: "丐院",
    template: "%s · 丐院",
  },
  description: "记录问题，看见参与者，保持并行。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
