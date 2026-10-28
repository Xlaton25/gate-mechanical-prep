import { useState } from "react";
import type { AttemptResponse, QuestionType } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Answer capture only. It never checks correctness — checking must happen
 * server-side against a versioned answer key (submitPracticeAttempt).
 */
export function PracticeAnswerInput({
  type, options = ["A", "B", "C", "D"], disabled, onSubmit,
}: { type: QuestionType; options?: string[]; disabled?: boolean; onSubmit: (r: AttemptResponse) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [nat, setNat] = useState("");
  const toggle = (o: string) =>
    setPicked((p) => (type === "MCQ" ? [o] : p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));
  const ready = type === "NAT" ? /^-?\d+(\.\d+)?$/.test(nat.trim()) : picked.length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || disabled) return;
        onSubmit(type === "NAT" ? { kind: "NAT", value: nat.trim() } : type === "MCQ" ? { kind: "MCQ", option: picked[0] ?? "" } : { kind: "MSQ", options: picked });
      }}
      className="space-y-4"
    >
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{type === "NAT" ? "Numerical answer" : type === "MCQ" ? "Choose one" : "Choose one or more"}</legend>
        {type === "NAT" ? (
          <Input inputMode="decimal" value={nat} onChange={(e) => setNat(e.target.value)} className="h-11 rounded-xl font-math" aria-label="Numerical answer" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {options.map((o) => (
              <Button key={o} type="button" variant={picked.includes(o) ? "default" : "outline"} aria-pressed={picked.includes(o)} onClick={() => toggle(o)}>
                {o}
              </Button>
            ))}
          </div>
        )}
      </fieldset>
      <Button type="submit" disabled={disabled || !ready} className="w-full sm:w-auto">Submit answer</Button>
    </form>
  );
}
