import React from "react";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/prism/csharp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";

// Only this curated set ships in this chunk, instead of react-syntax-highlighter's
// default `Prism` build which bundles all ~250 grammars (a ~270kB gzip chunk that
// used to load with every chat, code block or not - see MarkdownRenderer.tsx).
// An unregistered/unrecognized language just renders as unhighlighted text
// rather than failing, so this list only needs to cover the common cases.
[
  ["jsx", jsx],
  ["tsx", tsx],
  ["typescript", typescript],
  ["javascript", javascript],
  ["python", python],
  ["json", json],
  ["bash", bash],
  ["css", css],
  ["markup", markup],
  ["yaml", yaml],
  ["sql", sql],
  ["java", java],
  ["c", c],
  ["cpp", cpp],
  ["csharp", csharp],
  ["go", go],
  ["rust", rust],
  ["php", php],
  ["ruby", ruby],
  ["markdown", markdown],
  ["diff", diff],
].forEach(([name, lang]) => SyntaxHighlighter.registerLanguage(name as string, lang));

// Fenced code blocks commonly use shorthand/alternate names that don't match
// the grammar ids registered above - map them so e.g. ```js and ```py still highlight.
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  html: "markup",
  xml: "markup",
  svg: "markup",
  "c++": "cpp",
  "c#": "csharp",
  md: "markdown",
};

interface CodeHighlighterProps {
  language: string;
  children: string;
}

// Dynamically imported by MarkdownRenderer.tsx's CodeBlock - keep this module
// free of anything that shouldn't be deferred until a message actually
// renders a fenced code block.
const CodeHighlighter: React.FC<CodeHighlighterProps> = ({ language, children }) => (
  <SyntaxHighlighter
    style={vscDarkPlus as any}
    language={LANGUAGE_ALIASES[language] || language}
    PreTag="div"
    customStyle={{ margin: 0, padding: "1rem", background: "transparent" }}
    className="bg-[#1E1E1E] text-sm overflow-x-auto"
  >
    {children}
  </SyntaxHighlighter>
);

export default CodeHighlighter;
