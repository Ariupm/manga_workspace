import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPlan, selectBestVisualEvidence, visualQualityScore, type VisualQualityEvidence } from "../lib/visual-quality";

const evidence = (path: string, failures: VisualQualityEvidence["hardFailures"], overrides: Partial<VisualQualityEvidence["scores"]> = {}): VisualQualityEvidence => ({
  version: "visual-quality-v1", candidatePath: path, detector: "test", hardFailures: failures, summary: "",
  scores: { identity: .8, outfit: .8, anatomy: .8, interaction: .8, gaze: .8, framing: .8, environment: .8, ...overrides },
});

test("candidate selection prioritizes fewer hard failures before aesthetic score", () => {
  const clean = evidence("clean.png", [], { environment: .4 });
  const prettyButBroken = evidence("broken.png", [{ type: "prop", evidence: "phone missing", region: [.3, .4, .2, .2], confidence: .95 }], { environment: 1 });
  assert.equal(selectBestVisualEvidence([prettyButBroken, clean])?.candidatePath, "clean.png");
  assert.ok(visualQualityScore(clean.scores) > 0);
});

test("hands, prop and gaze failures become one interaction-unit repair", () => {
  const plan = buildRepairPlan(evidence("candidate.png", [
    { type: "hands", evidence: "left hand is fused", region: [.25, .42, .18, .25], confidence: .9 },
    { type: "prop", evidence: "smartphone is absent", region: [.34, .48, .18, .2], confidence: .98 },
    { type: "gaze", evidence: "eyes look at viewer", region: [.32, .16, .22, .22], confidence: .8 },
  ]));
  assert.equal(plan.decision, "localized_repair");
  assert.equal(plan.target, "interaction_unit");
  assert.ok(plan.region && plan.region[2] > .2 && plan.region[3] > .4);
});

test("framing or major anatomy failures force full regeneration", () => {
  const plan = buildRepairPlan(evidence("candidate.png", [{ type: "framing", evidence: "full body instead of close-up", region: [0, 0, 1, 1], confidence: .99 }]));
  assert.equal(plan.decision, "regenerate");
  assert.equal(plan.target, "whole_image");
});
