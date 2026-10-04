import { describe, it, expect } from "vitest";
import { ACCOUNT_SILO_RULES, ADVISOR_PERSONA } from "./advisorPersona";
import { CHAT_SYSTEM_PROMPT } from "./chat";
import { PULSE_SYSTEM_PROMPT } from "./pulseCheck";
import { NARRATIVES_SYSTEM_PROMPT } from "../../../ai/narratives";
import { TACTICAL_SYSTEM_PROMPT } from "../../../ai/tacticalAdvisor";

describe("ACCOUNT_SILO_RULES", () => {
  it("forbids moving money between any accounts, including across brokers", () => {
    expect(ACCOUNT_SILO_RULES).toMatch(/never moves between accounts/i);
    expect(ACCOUNT_SILO_RULES).toMatch(/Vanguard ↔ Fidelity/);
    expect(ACCOUNT_SILO_RULES).toMatch(/same broker/i);
  });

  it("treats equivalent funds in different accounts as one position, never to be consolidated", () => {
    expect(ACCOUNT_SILO_RULES).toContain("cross_account_groups");
    expect(ACCOUNT_SILO_RULES).toMatch(/FSKAX.*VTSAX/);
    expect(ACCOUNT_SILO_RULES).toMatch(/ONE position/);
  });

  it("limits consolidation to duplicate_groups within a single account", () => {
    expect(ACCOUNT_SILO_RULES).toContain("duplicate_groups");
    expect(ACCOUNT_SILO_RULES).toMatch(/only within that account/i);
  });

  it("is included in every AI prompt that can recommend actions", () => {
    for (const prompt of [ADVISOR_PERSONA, CHAT_SYSTEM_PROMPT, TACTICAL_SYSTEM_PROMPT, PULSE_SYSTEM_PROMPT, NARRATIVES_SYSTEM_PROMPT]) {
      expect(prompt).toContain(ACCOUNT_SILO_RULES);
    }
  });

  it("tells the tactical advisor to deploy pending cash inside the account that holds it", () => {
    expect(TACTICAL_SYSTEM_PROMPT).toMatch(/inside the account that holds the pending cash/i);
  });
});
