import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightToHtml } from "./highlight";

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-([\w+-]+)/.exec(className ?? "");
    const code = String(children).replace(/\n$/, "");
    // Inline code has no language and is usually single-line without fences.
    const isBlock = Boolean(match) || code.includes("\n");
    if (!isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    const lang = match?.[1];
    const html = highlightToHtml(code, lang);
    return (
      <code
        className={`hljs-block${className ? ` ${className}` : ""}`}
        data-lang={lang || undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
  pre({ children }) {
    return <pre className="hljs-pre">{children}</pre>;
  },
};

export function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
