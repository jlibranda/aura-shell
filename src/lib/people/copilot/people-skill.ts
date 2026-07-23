import type { CopilotSkill } from "@/lib/copilot/copilot-brain";
import { peopleCopilot } from "@/lib/people/copilot/people-copilot-service";
import { executePeopleFeature } from "@/lib/people/copilot/people-feature-router";

export const peopleSkill: CopilotSkill = { id: "people", name: "People", priority: 100, canHandle: () => true, execute: executePeopleFeature, suggestions: () => peopleCopilot.suggestions() };
