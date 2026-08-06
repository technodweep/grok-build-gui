import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightToHtml } from "./highlight";
import { LocalMedia } from "./LocalMedia";

function isLocalMediaSrc(src?: string): boolean {
  if (!src) return false;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return false;
  return /\.(png|jpe?g|gif|webp|bmp|mp4|webm|mov)(\?|$)/i.test(src);
}

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
  img({ src, alt }) {
    if (src && isLocalMediaSrc(src)) {
      return (
        <span style={{ display: "block", margin: "8px 0" }}>
          <LocalMedia path={src} maxHeight={360} />
          {alt ? (
            <span
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--gb-ink-muted)",
                marginTop: 4,
              }}
            >
              {alt}
            </span>
          ) : null}
        </span>
      );
    }
    if (!src) return null;
    return (
      <img
        src={src}
        alt={alt ?? ""}
        style={{
          maxWidth: "100%",
          maxHeight: 360,
          borderRadius: 10,
          border: "1px solid var(--gb-border)",
        }}
      />
    );
  },
};

export function MarkdownBody({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {text}
    </ReactMarkdown>
  );
}
