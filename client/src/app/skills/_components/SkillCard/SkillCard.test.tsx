import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "secret-leakage-gate",
  description: "Detects sk_live keys",
  type: "security",
  source: "imported_url",
  body: "# body",
  enabled: true,
  version: 2,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("shows name, type, source · version and the agents / pull freq / accept footer", () => {
    renderCard(<SkillCard skill={SKILL} stats={{ agents: 1, pull_pct: 92, accept_pct: 88 }} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("Imported · v2")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.getByText("92% pull freq")).toBeInTheDocument();
    expect(screen.getByText("88% accept")).toBeInTheDocument();
  });

  it("keeps the agent chip while stats are still loading", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("— agents")).toBeInTheDocument();
    expect(screen.queryByText("no runs yet")).not.toBeInTheDocument();
  });

  it("deletes from the trash button without opening the card", () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete secret-leakage-gate" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables the trash button while that skill is being deleted", () => {
    renderCard(<SkillCard skill={SKILL} deleting onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete secret-leakage-gate" })).toBeDisabled();
  });

  it("says there is no data yet instead of showing 0% when nothing ran", () => {
    renderCard(<SkillCard skill={SKILL} stats={{ agents: 0, pull_pct: null, accept_pct: null }} />);
    expect(screen.getByText("0 agents")).toBeInTheDocument();
    expect(screen.getByText("no runs yet")).toBeInTheDocument();
  });

  it("opens on click and on Enter, but the toggle does not open it", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("skill-card"));
    fireEvent.keyDown(screen.getByTestId("skill-card"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByLabelText("Enable secret-leakage-gate").firstElementChild as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
