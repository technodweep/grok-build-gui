/**
 * Lightweight zero-dep syntax highlighter for chat code fences.
 * Not a full grammar — enough to make common languages readable.
 */

type TokenKind =
  | "kw"
  | "str"
  | "cmt"
  | "num"
  | "type"
  | "fn"
  | "op"
  | "punct"
  | "plain";

interface Token {
  kind: TokenKind;
  text: string;
}

const LANG_KEYWORDS: Record<string, string[]> = {
  js: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while",
    "class", "import", "export", "from", "async", "await", "try", "catch",
    "throw", "new", "this", "typeof", "instanceof", "switch", "case", "break",
    "continue", "default", "of", "in", "null", "undefined", "true", "false",
    "yield", "extends", "super", "static", "get", "set", "typeof", "void",
  ],
  ts: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while",
    "class", "import", "export", "from", "async", "await", "try", "catch",
    "throw", "new", "this", "typeof", "interface", "type", "enum", "implements",
    "extends", "public", "private", "protected", "readonly", "as", "is",
    "null", "undefined", "true", "false", "void", "never", "any", "unknown",
    "keyof", "infer", "declare", "namespace", "module", "satisfies",
  ],
  py: [
    "def", "class", "return", "if", "elif", "else", "for", "while", "import",
    "from", "as", "try", "except", "finally", "raise", "with", "yield",
    "async", "await", "lambda", "pass", "break", "continue", "in", "is",
    "not", "and", "or", "True", "False", "None", "global", "nonlocal",
    "assert", "del", "match", "case",
  ],
  rs: [
    "fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "pub",
    "use", "mod", "crate", "self", "super", "async", "await", "return",
    "if", "else", "match", "loop", "while", "for", "in", "where", "type",
    "true", "false", "Some", "None", "Ok", "Err", "move", "ref", "static",
    "unsafe", "dyn", "as", "break", "continue", "yield",
  ],
  go: [
    "func", "package", "import", "var", "const", "type", "struct", "interface",
    "map", "chan", "go", "defer", "return", "if", "else", "for", "range",
    "switch", "case", "default", "select", "break", "continue", "fallthrough",
    "true", "false", "nil", "make", "new", "len", "cap",
  ],
  java: [
    "class", "interface", "enum", "public", "private", "protected", "static",
    "final", "void", "return", "if", "else", "for", "while", "try", "catch",
    "throw", "throws", "new", "this", "super", "extends", "implements",
    "import", "package", "true", "false", "null", "abstract", "synchronized",
  ],
  sh: [
    "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
    "esac", "in", "function", "return", "export", "local", "readonly", "true",
    "false", "echo", "cd", "exit", "source",
  ],
  bash: [
    "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
    "esac", "in", "function", "return", "export", "local", "readonly", "true",
    "false", "echo", "cd", "exit", "source",
  ],
  json: ["true", "false", "null"],
  css: [
    "important", "from", "to", "and", "or", "not", "only",
  ],
  sql: [
    "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT",
    "RIGHT", "INNER", "OUTER", "ON", "AS", "AND", "OR", "NOT", "NULL", "IN",
    "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "CREATE", "TABLE",
    "INDEX", "VALUES", "SET", "INTO", "DISTINCT", "COUNT", "SUM", "AVG",
  ],
};

function normalizeLang(lang?: string): string {
  const l = (lang ?? "").toLowerCase().trim();
  if (!l) return "plain";
  if (l === "javascript" || l === "jsx" || l === "mjs" || l === "cjs") return "js";
  if (l === "typescript" || l === "tsx" || l === "mts") return "ts";
  if (l === "python" || l === "py3") return "py";
  if (l === "rust") return "rs";
  if (l === "golang") return "go";
  if (l === "shell" || l === "zsh" || l === "shellscript") return "sh";
  if (l === "yml") return "yaml";
  return l;
}

function pushPlain(out: Token[], text: string) {
  if (!text) return;
  out.push({ kind: "plain", text });
}

/** Tokenize source into simple highlight tokens. */
export function tokenize(code: string, lang?: string): Token[] {
  const L = normalizeLang(lang);
  if (L === "plain" || L === "text" || L === "markdown" || L === "md") {
    return [{ kind: "plain", text: code }];
  }

  const keywords = new Set(
    (LANG_KEYWORDS[L] ?? []).map((k) =>
      L === "sql" ? k.toUpperCase() : k,
    ),
  );
  const out: Token[] = [];
  let i = 0;
  const n = code.length;

  const lineComment =
    L === "py" || L === "sh" || L === "bash" || L === "yaml" || L === "toml"
      ? "#"
      : L === "sql"
        ? "--"
        : "//";
  const blockComment = L === "py" || L === "sh" || L === "bash" || L === "yaml" ? null : "/*";

  while (i < n) {
    // strings
    const ch = code[i];
    if (ch === '"' || ch === "'" || (ch === "`" && (L === "js" || L === "ts"))) {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push({ kind: "str", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // line comments
    if (
      (lineComment === "//" && code.startsWith("//", i)) ||
      (lineComment === "#" && ch === "#") ||
      (lineComment === "--" && code.startsWith("--", i))
    ) {
      let j = i;
      while (j < n && code[j] !== "\n") j += 1;
      out.push({ kind: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // block comments
    if (blockComment && code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      const j = end >= 0 ? end + 2 : n;
      out.push({ kind: "cmt", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // numbers
    if (/\d/.test(ch) && (i === 0 || /[\s([{,:=+\-*/%<>!&|^~?;]/.test(code[i - 1] ?? " "))) {
      let j = i;
      while (j < n && /[\d._xXa-fA-F]/.test(code[j])) j += 1;
      out.push({ kind: "num", text: code.slice(i, j) });
      i = j;
      continue;
    }

    // identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j += 1;
      const word = code.slice(i, j);
      const key = L === "sql" ? word.toUpperCase() : word;
      // type-ish Capitalized (not all-caps SQL)
      if (keywords.has(key)) {
        out.push({ kind: "kw", text: word });
      } else if (
        (L === "ts" || L === "js" || L === "java" || L === "rs" || L === "go") &&
        /^[A-Z][A-Za-z0-9_]*$/.test(word)
      ) {
        out.push({ kind: "type", text: word });
      } else if (j < n && code[j] === "(") {
        out.push({ kind: "fn", text: word });
      } else {
        out.push({ kind: "plain", text: word });
      }
      i = j;
      continue;
    }

    // operators / punctuation / whitespace
    let j = i + 1;
    // group consecutive whitespace
    if (/\s/.test(ch)) {
      while (j < n && /\s/.test(code[j])) j += 1;
      pushPlain(out, code.slice(i, j));
      i = j;
      continue;
    }
    out.push({ kind: "punct", text: ch });
    i = j;
  }

  return out;
}

const KIND_CLASS: Record<TokenKind, string> = {
  kw: "hl-kw",
  str: "hl-str",
  cmt: "hl-cmt",
  num: "hl-num",
  type: "hl-type",
  fn: "hl-fn",
  op: "hl-op",
  punct: "hl-punct",
  plain: "",
};

/** Render tokens to HTML string (escaped). */
export function highlightToHtml(code: string, lang?: string): string {
  const tokens = tokenize(code, lang);
  return tokens
    .map((t) => {
      const escaped = escapeHtml(t.text);
      const cls = KIND_CLASS[t.kind];
      return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    })
    .join("");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
