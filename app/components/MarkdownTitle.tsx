import type { ReactNode } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function inline({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function MarkdownTitle({ className, source }: { className?: string; source: string }) {
  const normalizedSource = source.replace(/\$([^$\n]+)\$/g, (match, expression: string) => {
    return expression.trim() === "&" ? "$\\&$" : match;
  });
  return (
    <span className={`markdown-title${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        components={{
          a: inline,
          blockquote: inline,
          br: () => <> </>,
          h1: inline,
          h2: inline,
          h3: inline,
          h4: inline,
          h5: inline,
          h6: inline,
          img: ({ alt }) => <>{alt ?? "图片"}</>,
          li: inline,
          ol: inline,
          p: inline,
          pre: inline,
          table: inline,
          tbody: inline,
          td: inline,
          th: inline,
          thead: inline,
          tr: inline,
          ul: inline,
        }}
        rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, trust: false }]]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {normalizedSource}
      </ReactMarkdown>
    </span>
  );
}
