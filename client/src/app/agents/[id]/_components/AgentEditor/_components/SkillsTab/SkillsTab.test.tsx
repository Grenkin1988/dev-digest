import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const saved = vi.fn();
const mk = (id: string, enabled = true): Skill => ({
  id,
  name: id,
  description: `${id} desc`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled,
  version: 1,
});

// Linked: second, first (in that order). Not linked: third (globally disabled).
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [mk("first"), mk("second"), mk("third", false)], isLoading: false, isError: false }),
  useAgentSkills: () => ({
    data: [
      { agent_id: "ag1", skill_id: "first", order: 1 },
      { agent_id: "ag1", skill_id: "second", order: 0 },
    ],
  }),
  useSetAgentSkills: () => ({ mutate: saved }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Sec" } as Agent;

beforeEach(() => saved.mockClear());
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("agent SkillsTab", () => {
  it("lists linked skills first in link order, then the rest, with the enabled count", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row").map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("second");
    expect(rows[1]).toContain("first");
    expect(rows[2]).toContain("third");
    expect(rows[2]).toContain("disabled");
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
  });

  it("attaches a skill at the end of the order", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /third/ }));
    expect(saved).toHaveBeenCalledWith(["second", "first", "third"]);
  });

  it("detaches a skill", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /second/ }));
    expect(saved).toHaveBeenCalledWith(["first"]);
  });

  it("reorders with the move buttons", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move second down" }));
    expect(saved).toHaveBeenCalledWith(["first", "second"]);
  });

  it("turns reordering off while a filter is active", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "fir" } });
    expect(screen.getAllByTestId("agent-skill-row")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Move first/ })).not.toBeInTheDocument();
  });
});
