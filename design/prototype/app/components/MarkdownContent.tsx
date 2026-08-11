import katex from "katex";
import type { ReactNode } from "react";

function MathFormula({ display, expression }: { display?: boolean; expression: string }) {
  const html = katex.renderToString(expression.trim(), {
    displayMode: display,
    strict: "ignore",
    throwOnError: false,
    trust: false,
  });
  const Tag = display ? "div" : "span";
  return <Tag className={display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderInline(text: string) {
  return text.split(/(`[^`\n]+`|\$(?!\$)[^$\n]+\$)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$")) return <MathFormula expression={part.slice(1, -1)} key={`${part}-${index}`} />;
    return part;
  });
}

export function MarkdownContent({ className, source }: { className?: string; source: string }) {
  const elements: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    elements.push(<ul key={`list-${elements.length}`}>{list.map((item) => <li key={item}>{renderInline(item)}</li>)}</ul>);
    list = [];
  };
  const lines = source.trim().split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("$$")) {
      flushList();
      let expression = trimmed.slice(2);
      let closed = expression.endsWith("$$");
      if (closed) expression = expression.slice(0, -2);
      while (!closed && index + 1 < lines.length) {
        index += 1;
        const nextLine = lines[index].trim();
        closed = nextLine.endsWith("$$");
        expression += `${expression ? "\n" : ""}${closed ? nextLine.slice(0, -2) : nextLine}`;
      }
      elements.push(<MathFormula display expression={expression} key={`math-${elements.length}`} />);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={`heading-${elements.length}`}>{renderInline(line.slice(3))}</h3>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (trimmed) {
      flushList();
      elements.push(<p key={`paragraph-${elements.length}`}>{renderInline(line)}</p>);
    } else {
      flushList();
    }
  }
  flushList();
  return <div className={`markdown-content${className ? ` ${className}` : ""}`}>{elements}</div>;
}
