import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export function MarkdownContent({ className, compact = false, source }: { className?: string; compact?: boolean; source: string }) {
  return (
    <div className={`markdown-content${compact ? " markdown-compact" : ""}${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        components={compact ? {
          a: ({ children }) => <span>{children}</span>,
          img: ({ alt }) => <span>{alt ?? "图片"}</span>,
        } : {
          a: ({ children, href }) => {
            const external = Boolean(href && /^https?:\/\//i.test(href));
            const attachment = Boolean(href?.startsWith("/api/attachments/"));
            return <a className={attachment ? "message-attachment-link" : undefined} download={attachment || undefined} href={href} rel={external ? "noreferrer" : undefined} target={external ? "_blank" : undefined}>{children}</a>;
          },
        }}
        rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, trust: false }]]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
