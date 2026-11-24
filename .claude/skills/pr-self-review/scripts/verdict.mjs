// Pure merge / normalization / verdict logic for finalize.mjs (unit-tested).
//
// The verdict is DERIVED from findings, never taken from a model
// (docs/agent-prompts/README.md: "verdict is currently passed through from the
// model" is exactly the bug we avoid here).
import { SEVERITIES } from "./lib.mjs";

const RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function computeVerdict(findings) {
  if (findings.some((f) => f.severity === "CRITICAL")) return "request_changes";
  // Same mapping as docs/agent-prompts/README.md §"Verdict semantics":
  // approve ⇔ no findings at all; comment ⇔ only non-blocking findings.
  return findings.length ? "comment" : "approve";
}

function valid(f) {
  return (
    f &&
    SEVERITIES.includes(f.severity) &&
    typeof f.file === "string" && f.file.length > 0 &&
    Number.isInteger(f.line) && f.line >= 1 &&
    typeof f.rule === "string" && f.rule.length > 0 &&
    typeof f.summary === "string" && f.summary.length > 0
  );
}

/**
 * Applies the gate rules to skill-review findings:
 *  - malformed findings (no severity/file/line/rule/summary) are dropped;
 *  - findings on files outside the diff are capped at WARNING (pre-existing code
 *    must not block this PR);
 *  - a CRITICAL that the verifier did not CONFIRM is downgraded to WARNING;
 *  - every routed skill must have a completed review, otherwise CRITICAL.
 */
export function normalizeReviews(llm, plan) {
  const inDiff = new Set(plan.files.map((f) => f.path));
  const out = [];
  let dropped = 0;
  const reviews = llm?.reviews ?? [];
  const done = new Map(reviews.map((r) => [r.skill, r]));

  for (const [skill, files] of Object.entries(plan.skills)) {
    const r = done.get(skill);
    if (!r || r.status !== "done") {
      out.push({
        severity: "CRITICAL", file: files[0], line: 1, rule: "pr-self-review#coverage", skill, source: "skill",
        summary: `Skill "${skill}" was routed ${files.length} file(s) but its review ${r ? `did not complete (${r.status}${r.error ? ": " + r.error : ""})` : "never ran"}.`,
        fix: "Re-run /pr-self-review; every routed skill must report.",
        verification: "CONFIRMED",
      });
    }
  }

  for (const r of reviews) {
    for (const raw of r.findings ?? []) {
      if (!valid(raw)) {
        dropped++;
        continue;
      }
      const f = { ...raw, skill: raw.skill ?? r.skill, source: "skill", notes: [...(raw.notes ?? [])] };
      if (!inDiff.has(f.file) && f.severity === "CRITICAL") {
        f.severity = "WARNING";
        f.notes.push("downgraded: file is not part of this diff");
      }
      if (f.severity === "CRITICAL" && f.verification !== "CONFIRMED") {
        f.severity = "WARNING";
        f.notes.push(f.verification === "REJECTED"
          ? `downgraded: verifier rejected it${f.verificationNote ? " — " + f.verificationNote : ""}`
          : "downgraded: CRITICAL was not verified");
      }
      out.push(f);
    }
  }
  return { findings: out, dropped };
}

/** Same file+line+rule from several sources → one finding at the highest severity. */
export function dedupe(findings) {
  const byKey = new Map();
  for (const f of findings) {
    const key = `${f.file}|${f.line}|${f.rule}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...f, skills: [f.skill] });
      continue;
    }
    if (!prev.skills.includes(f.skill)) prev.skills.push(f.skill);
    if (RANK[f.severity] < RANK[prev.severity]) Object.assign(prev, { ...f, skills: prev.skills });
  }
  return [...byKey.values()].sort(
    (a, b) => RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  );
}

export function counts(findings) {
  const c = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

const VERDICT_LABEL = {
  request_changes: "BLOCKED (request_changes) — at least one CRITICAL",
  comment: "PASS with non-blocking findings (comment)",
  approve: "PASS (approve)",
};

export function renderMarkdown(report) {
  const c = report.counts;
  const lines = [
    `# PR self-review — ${VERDICT_LABEL[report.verdict]}`,
    "",
    `Base \`${report.base.ref}\` @ \`${report.base.sha.slice(0, 10)}\` · fingerprint \`${report.fingerprint.slice(0, 16)}\` · ${report.createdAt}`,
    "",
    `**${c.CRITICAL} CRITICAL · ${c.WARNING} WARNING · ${c.SUGGESTION} SUGGESTION** across ${report.filesReviewed} file(s).`,
    "",
    "Skills run: " + (report.skillsRun.map((s) => `\`${s}\``).join(", ") || "none"),
    "",
    "Checks: " + (report.checks.map((r) => `${r.pkg} ${r.kind} **${r.status}**`).join(" · ") || "none"),
    "",
  ];
  const section = (sev, title) => {
    const list = report.findings.filter((f) => f.severity === sev);
    if (!list.length) return;
    lines.push(`## ${title} (${list.length})`, "");
    for (const f of list) {
      lines.push(`- **${f.file}:${f.line}** — ${f.summary}  `);
      lines.push(`  _${f.rule}_ · ${f.skills.join(", ")}${f.notes?.length ? " · " + f.notes.join("; ") : ""}`);
      if (f.fix) lines.push(`  Fix: ${f.fix}`);
    }
    lines.push("");
  };
  section("CRITICAL", "Blocking");
  section("WARNING", "Warnings");
  section("SUGGESTION", "Suggestions");
  if (report.unreviewed.length) {
    lines.push(`Files with no reviewing skill: ${report.unreviewed.map((p) => `\`${p}\``).join(", ")}`, "");
  }
  if (report.dropped) lines.push(`${report.dropped} malformed finding(s) dropped (missing file/line/rule).`, "");
  return lines.join("\n");
}
