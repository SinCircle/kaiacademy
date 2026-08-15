export const MAX_MESSAGE_ATTACHMENTS = 2;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_MESSAGE_ATTACHMENT_TITLE = 100;

export type DraftMessageAttachment = {
  draftId: string;
  title: string;
  content: string;
};

export type MessageDraft = {
  body: string;
  attachments: DraftMessageAttachment[];
};

const MARKER_SOURCE = "\\uE000attachment:([0-9a-f-]{36})\\uE001";

export function attachmentMarker(draftId: string) {
  return `\uE000attachment:${draftId}\uE001`;
}

export function attachmentMarkerPattern() {
  return new RegExp(MARKER_SOURCE, "gi");
}

export function utf8Size(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function convertList(source: string, environment: "itemize" | "enumerate") {
  const expression = new RegExp(`\\\\begin\\{${environment}\\}([\\s\\S]*?)\\\\end\\{${environment}\\}`, "g");
  return source.replace(expression, (_match, body: string) => {
    const entries = body.split(/\\item\s+/).slice(1).map((item) => item.trim()).filter(Boolean);
    return `\n${entries.map((item, index) => `${environment === "enumerate" ? `${index + 1}.` : "-"} ${item}`).join("\n")}\n`;
  });
}

function stripLatexComments(source: string) {
  return source.split("\n").map((line) => {
    let escaped = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === "%" && !escaped) return line.slice(0, index).trimEnd();
      escaped = character === "\\" ? !escaped : false;
    }
    return line;
  }).join("\n");
}

export function latexToMarkdown(input: string) {
  let source = stripLatexComments(input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"));
  const document = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (document) source = document[1];

  source = source
    .replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\begin\{displaymath\}([\s\S]*?)\\end\{displaymath\}/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_match, math: string) => `\n\n$$\n\\begin{aligned}\n${math.trim()}\n\\end{aligned}\n$$\n\n`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`);

  source = convertList(convertList(source, "itemize"), "enumerate")
    .replace(/\\section\*?\{([^{}]*)\}/g, "\n\n# $1\n\n")
    .replace(/\\subsection\*?\{([^{}]*)\}/g, "\n\n## $1\n\n")
    .replace(/\\subsubsection\*?\{([^{}]*)\}/g, "\n\n### $1\n\n")
    .replace(/\\paragraph\*?\{([^{}]*)\}/g, "\n\n#### $1\n\n")
    .replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g, "[$2]($1)")
    .replace(/\\url\{([^{}]*)\}/g, "<$1>")
    .replace(/\\textbf\{([^{}]*)\}/g, "**$1**")
    .replace(/\\(?:emph|textit)\{([^{}]*)\}/g, "*$1*")
    .replace(/\\texttt\{([^{}]*)\}/g, "`$1`")
    .replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g, (_match, quote: string) => `\n${quote.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n`)
    .replace(/\\(?:label|bibliographystyle|bibliography)\{[^{}]*\}/g, "")
    .replace(/\\(?:documentclass|usepackage)(?:\[[^\]]*\])?\{[^{}]*\}/g, "")
    .replace(/\\(?:begin|end)\{(?:document|center|flushleft|flushright)\}/g, "")
    .replace(/\\\\(?=\s|$)/g, "  \n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return source;
}
