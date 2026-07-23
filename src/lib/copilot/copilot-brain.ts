import type { CopilotAnswer, CopilotContext } from "@/lib/people/copilot/types";

export interface CopilotSkill { id: string; name: string; priority: number; canHandle(question: string, context: CopilotContext): boolean; execute(question: string, context: CopilotContext): CopilotAnswer; suggestions(): string[]; }

export class CopilotBrain {
  private skills: CopilotSkill[] = [];
  register(skill: CopilotSkill): void { this.skills = [...this.skills.filter((item) => item.id !== skill.id), skill].sort((a, b) => b.priority - a.priority); }
  ask(question: string, context: CopilotContext): CopilotAnswer {
    const startedAt = Date.now(); const skill = this.skills.find((item) => item.canHandle(question, context));
    const response = skill ? skill.execute(question, context) : { kind: "text" as const, headline: "I understood that you're asking about a capability that is not connected to Copilot yet.", empty: true };
    if (process.env.NODE_ENV === "development") console.debug("[CopilotBrain]", { skill: skill?.id ?? "none", executionMs: Date.now() - startedAt, responseKind: response.kind });
    return response;
  }
  suggestions(): string[] { return [...new Set(this.skills.flatMap((skill) => skill.suggestions()))]; }
}
