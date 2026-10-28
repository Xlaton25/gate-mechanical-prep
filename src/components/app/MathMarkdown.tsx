import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown + KaTeX for question, option and solution text. Text is rendered as written
 * (official wording preserved). Raw HTML is dropped, images are not rendered, links only
 * keep safe protocols, and KaTeX runs untrusted (no \href/\url/\htmlClass).
 */
const safeUrl = (url: string) => {
  const u = defaultUrlTransform(url);
  return /^(https?:|mailto:|#|\/)/i.test(u) ? u : "";
};

export function MathMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("math-md", className)}>
      <ReactMarkdown
        skipHtml
        disallowedElements={["img"]}
        unwrapDisallowed
        urlTransform={safeUrl}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, maxExpand: 200, maxSize: 20 }]]}
        components={{
          a: ({ href, children: c }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{c}</a> : <span>{c}</span>),
          table: ({ children: c }) => (
            <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-sm">{c}</table></div>
          ),
          th: ({ children: c }) => <th className="border border-border px-2 py-1 text-left font-semibold">{c}</th>,
          td: ({ children: c }) => <td className="border border-border px-2 py-1">{c}</td>,
          p: ({ children: c }) => <p className="my-2 first:mt-0 last:mb-0">{c}</p>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
