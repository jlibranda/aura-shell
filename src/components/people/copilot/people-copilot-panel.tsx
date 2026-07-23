"use client";

import { useMemo, useState } from "react";
import { CornerDownLeft, Send, Sparkles } from "lucide-react";
import { CopilotAnswerView } from "@/components/people/copilot/copilot-answer-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { peopleCopilot } from "@/lib/people/copilot/people-copilot-service";
import type { CopilotAnswer, CopilotContext } from "@/lib/people/copilot/types";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { currentCopilotViewer } from "@/lib/people/copilot/access-policy";

interface Turn {
  id: number;
  question: string;
  answer: CopilotAnswer;
}

export function PeopleCopilotPanel() {
  const employees = usePeopleRepository((state) => state.employees);
  const departments = usePeopleRepository((state) => state.departments);
  const teams = usePeopleRepository((state) => state.teams);
  const context: CopilotContext = useMemo(
    () => ({ employees, departments, teams, viewer: currentCopilotViewer(employees) }),
    [employees, departments, teams],
  );
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const counter = useMemo(() => ({ n: 0 }), []);

  const ask = (question: string) => {
    const value = question.trim();
    if (!value) return;

    const answer = peopleCopilot.ask(value, context);
    counter.n += 1;
    setTurns((previous) => [{ id: counter.n, question: value, answer }, ...previous]);
    setDraft("");
  };

  const suggestions = peopleCopilot.suggestions();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-aura">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">People Copilot</h1>
          <p className="text-sm text-muted-foreground">Ask about your people. Answers come straight from your records.</p>
        </div>
      </div>

      <Card className="p-4">
        <form onSubmit={(event) => { event.preventDefault(); ask(draft); }} className="flex items-center gap-2 rounded-xl border border-input bg-surface px-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your people…" className="h-11 flex-1 bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
          <Button type="submit" size="sm" disabled={!draft.trim()}><Send className="h-4 w-4" />Ask</Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button key={suggestion} onClick={() => ask(suggestion)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted/50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5">{suggestion}</button>
          ))}
        </div>
      </Card>

      <div className="mt-5 space-y-4">
        {turns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-10 text-center text-sm text-muted-foreground">Ask a question above to get started. Try one of the suggestions.</p>
        ) : turns.map((turn) => (
          <Card key={turn.id} className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><CornerDownLeft className="h-3.5 w-3.5" /><span className="font-medium text-foreground">{turn.question}</span></div>
            <CopilotAnswerView answer={turn.answer} />
          </Card>
        ))}
      </div>
    </div>
  );
}
