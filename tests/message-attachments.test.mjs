import assert from "node:assert/strict";
import test from "node:test";

import {
  attachmentMarker,
  attachmentMarkerPattern,
  latexToMarkdown,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  utf8Size,
} from "../app/lib/message-attachments.ts";

test("attachment markers preserve an exact inline position", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const source = `前文${attachmentMarker(id)}后文`;
  assert.deepEqual(Array.from(source.matchAll(attachmentMarkerPattern()), (match) => match[1]), [id]);
});

test("common LaTeX document structures convert to Markdown", () => {
  const markdown = latexToMarkdown(String.raw`\documentclass{article}
\begin{document}
\section{证明}
设 \(x>0\)。
\begin{itemize}
\item 第一项
\item 第二项
\end{itemize}
\begin{equation}
x^2=1
\end{equation}
\end{document}`);
  assert.match(markdown, /^# 证明/);
  assert.match(markdown, /设 \$x>0\$。/);
  assert.match(markdown, /- 第一项\n- 第二项/);
  assert.match(markdown, /\$\$\nx\^2=1\n\$\$/);
});

test("attachment byte limits are measured as UTF-8", () => {
  assert.equal(utf8Size("中文"), 6);
  assert.equal(utf8Size("a".repeat(MAX_MESSAGE_ATTACHMENT_BYTES)), MAX_MESSAGE_ATTACHMENT_BYTES);
});
