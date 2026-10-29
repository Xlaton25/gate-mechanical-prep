import { useState } from "react";
import type { PracticeQuestionDetail } from "@/lib/practice-schema";
import { MathMarkdown } from "./MathMarkdown";

/** Source artwork retains mathematical notation and diagrams; OCR is only a search aid. */
export function QuestionContent({ question }: { question: Pick<PracticeQuestionDetail, "number" | "bodyMd" | "figures"> }) {
  const [enlarged, setEnlarged] = useState(false);
  if (!question.figures?.length) return <MathMarkdown className="text-base leading-relaxed">{question.bodyMd}</MathMarkdown>;
  return <div className="space-y-3">
    <button type="button" onClick={() => setEnlarged(!enlarged)} className="rounded-lg border border-border px-3 py-2 text-sm" aria-pressed={enlarged}>{enlarged ? "Fit to screen" : "Enlarge question"}</button>
    {question.figures.map((figure, index) => <figure key={index} className="overflow-x-auto rounded-xl border border-border bg-white p-2">
      <img src={`data:image/png;base64,${figure.pngBase64}`} alt={`Question ${question.number}, original source page ${figure.sourcePage}`} className={enlarged ? "h-auto w-[1000px] min-w-[1000px] max-w-none" : "mx-auto h-auto w-full max-w-[1000px]"} />
      <figcaption className="mt-2 text-center text-xs text-slate-600">Original question · page {figure.sourcePage}</figcaption>
    </figure>)}
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Extracted text (may contain recognition errors)</summary><pre className="mt-2 whitespace-pre-wrap font-sans">{question.bodyMd}</pre></details>
  </div>;
}
