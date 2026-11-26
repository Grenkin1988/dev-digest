import type { Agent } from "@devdigest/shared";
import type { UpdateAgentInput } from "@/lib/hooks/agents";

type AgentUpdate = UpdateAgentInput["patch"];

/** The editable fields of an agent, as the Config form holds them. */
export type ConfigForm = Pick<
  Agent,
  "name" | "description" | "provider" | "model" | "system_prompt" | "strategy" | "ci_fail_on" | "repo_intel" | "enabled"
>;

export type ConfigAction = { [K in keyof ConfigForm]: { field: K; value: ConfigForm[K] } }[keyof ConfigForm];

/** Initial form state: a copy of the agent's editable fields. */
export function formFromAgent(agent: Agent): ConfigForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
    repo_intel: agent.repo_intel,
    enabled: agent.enabled,
  };
}

export function configReducer(state: ConfigForm, action: ConfigAction): ConfigForm {
  return { ...state, [action.field]: action.value };
}

/** The PUT /agents/:id patch for the current form. */
export function toPatch(form: ConfigForm): AgentUpdate {
  return { ...form };
}
