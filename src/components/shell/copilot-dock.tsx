"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { CopilotAnswerView } from "@/components/people/copilot/copilot-answer-view";
import { Sheet, SheetHeader } from "@/components/ui/overlay";
import { globalCopilotRouter } from "@/lib/copilot/global-copilot-router";
import type { CopilotAnswer, CopilotContext } from "@/lib/people/copilot/types";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { currentCopilotViewer } from "@/lib/people/copilot/access-policy";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface Bubble {
  id: number;
  role: "user" | "assistant";
  text?: string;
  answer?: CopilotAnswer;
}

export function CopilotDock() {
  const open = useUIStore((state) => state.copilotOpen);
  const setOpen = useUIStore((state) => state.setCopilotOpen);
  const employees = usePeopleRepository((state) => state.employees);
  const departments = usePeopleRepository((state) => state.departments);
  const teams = usePeopleRepository((state) => state.teams);
  const [activeEmployeeName, setActiveEmployeeName] = useState<string>();
  const context: CopilotContext = useMemo(
    () => ({ employees, departments, teams, viewer: currentCopilotViewer(employees), activeEmployeeName }),
    [employees, departments, teams, activeEmployeeName],
  );
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  const send = (question: string) => {
    const value = question.trim();
    if (!value) return;

    const userMessage: Bubble = { id: ++counter.current, role: "user", text: value };
    const assistantMessage: Bubble = {
      id: ++counter.current,
      role: "assistant",
      answer: globalCopilotRouter.ask(value, context),
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    if (assistantMessage.answer?.employees?.length === 1 && !assistantMessage.answer.empty) {
      const employee = assistantMessage.answer.employees[0];
      setActiveEmployeeName(`${employee.personal.firstName} ${employee.personal.lastName}`);
    }
    setDraft("");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const suggestions = globalCopilotRouter.suggestions();

  return (
    <Sheet open={open} onClose={() => setOpen(false)} side="right" width="sm" labelledBy="copilot-title">
      <SheetHeader id="copilot-title" title="AURA Copilot" onClose={() => setOpen(false)} accent>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></span>
        <div><div className="text-sm font-semibold text-foreground">Copilot</div><div className="text-[11px] text-muted-foreground">Ask about your people</div></div>
      </SheetHeader>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col">
            <div className="rounded-xl border border-border bg-surface-muted/50 p-4"><p className="text-sm text-foreground">I can help you find answers in your people records. Try one of these to get started.</p></div>
            <div className="mt-4 space-y-2">
              {suggestions.map((suggestion) => (
                <button key={suggestion} onClick={() => send(suggestion)} className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"><Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="flex-1">{suggestion}</span></button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", message.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border bg-surface-muted/60 text-foreground")}>
                  {message.role === "user" ? message.text : message.answer ? <CopilotAnswerView answer={message.answer} compact /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <form onSubmit={(event) => { event.preventDefault(); send(draft); }} className="flex items-end gap-2 rounded-xl border border-input bg-surface p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(draft); } }} rows={1} placeholder="Ask Copilot…" className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
          <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
        </form>
      </div>
    </Sheet>
  );
}
