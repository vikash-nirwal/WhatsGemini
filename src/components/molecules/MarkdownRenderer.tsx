import React, { useState, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaCheck, FaCopy } from 'react-icons/fa';
import { cn } from '../../utils/cn';
import { Button } from 'src/components/atoms/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table';

// react-syntax-highlighter (plus its registered language grammars) is a
// large dependency - deferred to its own chunk so it's only fetched the
// first time a message actually renders a fenced code block, not on every
// chat open. See CodeHighlighter.tsx for the language set it registers.
const CodeHighlighter = lazy(() => import('./CodeHighlighter'));

// CodeBlock Component to handle syntax highlighting and copying
const CodeBlock = ({ node, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!match) {
    return (
      <code className="bg-black/10 dark:bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono" {...props}>
        {children}
      </code>
    );
  }

  return (
    <div className="relative group my-4 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 font-mono">
        <span>{lang || 'text'}</span>
        <Button
          variant="ghost"
          onClick={handleCopy}
          className="h-auto w-auto p-0 gap-1.5 text-xs font-mono text-gray-500 dark:text-gray-400 hover:bg-transparent hover:text-gray-700 dark:hover:text-gray-200"
          title="Copy code"
        >
          {copied ? <FaCheck size={12} /> : <FaCopy size={12} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </Button>
      </div>
      <Suspense
        fallback={
          <pre className="bg-[#1E1E1E] text-sm overflow-x-auto m-0 p-4 text-gray-200">
            <code>{codeString}</code>
          </pre>
        }
      >
        <CodeHighlighter language={lang}>{codeString}</CodeHighlighter>
      </Suspense>
    </div>
  );
};

// Markdown Renderer memoized to prevent re-renders of old messages
const MarkdownRenderer = React.memo(({ msgText, isUser }: { msgText: string | any; isUser: boolean }) => {
  const safeText = typeof msgText === 'string' ? msgText : (typeof msgText?.text === 'string' ? msgText.text : JSON.stringify(msgText));
  return (
    <div className="markdown-content text-left break-words min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
          em: ({ node, ...props }) => <em className={cn("italic", isUser ? 'text-foreground/80' : 'text-muted-foreground')} {...props} />,
          // eslint-disable-next-line jsx-a11y/anchor-has-content
          a: ({ node, ...props }) => <a className={cn(isUser ? 'text-foreground underline' : 'text-primary hover:underline')} target="_blank" rel="noopener noreferrer" {...props} aria-hidden="true" />,
          ul: ({ node, ...props }) => <ul className="list-disc ml-5 mb-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-5 mb-2" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
          code: CodeBlock,
          blockquote: ({ node, ...props }) => <blockquote className={cn("border-l-4 pl-4 py-1 my-2 italic", isUser ? 'border-primary/40' : 'border-border')} {...props} />,
          table: ({ node, ...props }) => <div className="my-2"><Table {...props} /></div>,
          thead: ({ node, ...props }) => <TableHeader {...props} />,
          tbody: ({ node, ...props }) => <TableBody {...props} />,
          tr: ({ node, ...props }) => <TableRow className={cn(isUser && "border-primary/20")} {...props} />,
          th: ({ node, ...props }) => <TableHead className={cn(isUser && "bg-primary/10 text-foreground")} {...props} />,
          td: ({ node, ...props }) => <TableCell className={cn(isUser && "text-foreground")} {...props} />,
        }}
      >
        {safeText}
      </ReactMarkdown>
    </div>
  );
});
MarkdownRenderer.displayName = "MarkdownRenderer";

export default MarkdownRenderer;
