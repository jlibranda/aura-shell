import { CopilotBrain } from "@/lib/copilot/copilot-brain";
import { peopleSkill } from "@/lib/people/copilot/people-skill";
import type { CopilotAnswer, CopilotContext } from "@/lib/people/copilot/types";

/** Routes global Copilot requests to domain services without coupling the UI to a module. */
export interface GlobalCopilotRouter {
  ask(question: string, context: CopilotContext): CopilotAnswer;
  suggestions(): string[];
}

class DefaultGlobalCopilotRouter implements GlobalCopilotRouter {
  private brain = new CopilotBrain();
  constructor() { this.brain.register(peopleSkill); }
  ask(question: string, context: CopilotContext): CopilotAnswer {
    return this.brain.ask(question, context);
  }

  suggestions(): string[] {
    return this.brain.suggestions();
  }
}

export const globalCopilotRouter: GlobalCopilotRouter = new DefaultGlobalCopilotRouter();
