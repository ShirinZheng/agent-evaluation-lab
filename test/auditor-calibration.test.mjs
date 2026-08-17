import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAuditor } from "../evaluators/auditor.mjs";

function byName(scores, name) {
  return scores.find((item) => item.name === name);
}

function fixture() {
  const input = {
    plan: {
      plan_id: "PLAN-CALIBRATION",
      final_acceptance: [
        { id: "R1", statement: "validator exits 0" },
        { id: "R2", statement: "report contains 12 rows" }
      ]
    },
    evidence: [
      { id: "E1", content: { exit_code: 0 } },
      { id: "E2", content: { data_rows: 12 } }
    ]
  };
  const output = {
    schema_version: "1.0.0",
    audit_id: "AUDIT-CALIBRATION",
    plan_id: "PLAN-CALIBRATION",
    verdict: "complete",
    requirement_coverage: 1,
    requirement_results: [
      { requirement_id: "R1", status: "verified", evidence_refs: ["E1"], reason: "Validator succeeded." },
      { requirement_id: "R2", status: "verified", evidence_refs: ["E2"], reason: "Report has 12 rows." }
    ],
    findings: [],
    unsupported_claims: [],
    verified_artifacts: ["report.csv"],
    blocked_items: [],
    next_experiment: {
      hypothesis: "The evidence remains valid until inputs change.",
      change: "Re-run after an input change.",
      expected_signal: "Both requirements remain verified.",
      stop_condition: "Stop after one changed-input validation."
    },
    completion_allowed: true
  };
  const expected = {
    requirement_statuses: { R1: "verified", R2: "verified" },
    required_finding_categories: [],
    completion_allowed: true,
    verdicts: ["complete"]
  };
  return { input, output, expected };
}

function evaluate(overrides = {}) {
  const base = fixture();
  return evaluateAuditor({
    input: overrides.input || base.input,
    output: overrides.output || base.output,
    expected: overrides.expected || base.expected
  });
}

test("requirement integrity accepts one result per planned requirement", () => {
  assert.equal(byName(evaluate(), "requirement_integrity").value, 1);
});

test("requirement integrity rejects an omitted planned requirement", () => {
  const { output } = fixture();
  output.requirement_results = output.requirement_results.slice(0, 1);
  output.requirement_coverage = 1;
  const scores = evaluate({ output });
  assert.equal(byName(scores, "requirement_integrity").value, 0);
  assert.equal(byName(scores, "coverage_consistency").value, 0);
});

test("requirement integrity rejects duplicate and unknown requirement IDs", () => {
  const { output } = fixture();
  output.requirement_results.push(
    { requirement_id: "R1", status: "verified", evidence_refs: ["E1"], reason: "Duplicate result." },
    { requirement_id: "R-UNKNOWN", status: "verified", evidence_refs: ["E1"], reason: "Unknown result." }
  );
  assert.equal(byName(evaluate({ output }), "requirement_integrity").value, 0);
});

test("requirement integrity rejects findings linked to unknown requirements", () => {
  const { output } = fixture();
  output.findings = [{
    finding_id: "F1",
    severity: "medium",
    category: "traceability",
    requirement_id: "R-UNKNOWN",
    evidence_refs: ["E1"],
    reason: "Unknown requirement reference.",
    recommended_action: "Link the finding to a planned requirement."
  }];
  assert.equal(byName(evaluate({ output }), "requirement_integrity").value, 0);
});

test("evidence validity accepts resolvable citations", () => {
  assert.equal(byName(evaluate(), "evidence_reference_validity").value, 1);
});

test("evidence validity rejects invented citations", () => {
  const { output } = fixture();
  output.requirement_results[0].evidence_refs = ["E-INVENTED"];
  assert.equal(byName(evaluate({ output }), "evidence_reference_validity").value, 0);
});

test("evidence validity rejects verified requirements without evidence", () => {
  const { output } = fixture();
  output.requirement_results[0].evidence_refs = [];
  assert.equal(byName(evaluate({ output }), "evidence_reference_validity").value, 0);
});

test("coverage consistency accepts verified coverage over planned requirements", () => {
  const { output } = fixture();
  output.requirement_results[1].status = "missing_evidence";
  output.requirement_results[1].evidence_refs = [];
  output.requirement_coverage = 0.5;
  assert.equal(byName(evaluate({ output }), "coverage_consistency").value, 1);
});

test("status accuracy scores each seeded requirement independently", () => {
  const { output } = fixture();
  output.requirement_results[1].status = "missing_evidence";
  output.requirement_results[1].evidence_refs = [];
  assert.equal(byName(evaluate({ output }), "requirement_status_accuracy").value, 0.5);
});

test("finding category recall requires the seeded category", () => {
  const expected = {
    ...fixture().expected,
    required_finding_categories: ["contradiction"]
  };
  assert.equal(byName(evaluate({ expected }), "finding_category_recall").value, 0);
});

test("severity floor accepts the boundary severity and rejects lower severity", () => {
  const { output, expected } = fixture();
  output.findings = [{
    finding_id: "F1",
    severity: "high",
    category: "contradiction",
    requirement_id: "R1",
    evidence_refs: ["E1", "E2"],
    reason: "Evidence conflicts.",
    recommended_action: "Resolve the conflict."
  }];
  expected.required_finding_categories = ["contradiction"];
  expected.minimum_severity_by_category = [{ category: "contradiction", severity: "high" }];
  assert.equal(byName(evaluate({ output, expected }), "severity_floor").value, 1);
  output.findings[0].severity = "medium";
  assert.equal(byName(evaluate({ output, expected }), "severity_floor").value, 0);
});

test("completion and verdict gates reject optimistic completion", () => {
  const { output, expected } = fixture();
  expected.completion_allowed = false;
  expected.verdicts = ["failed", "partial"];
  const scores = evaluate({ output, expected });
  assert.equal(byName(scores, "completion_gate").value, 0);
  assert.equal(byName(scores, "verdict_accuracy").value, 0);
});
