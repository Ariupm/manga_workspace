import test from "node:test";
import assert from "node:assert/strict";
import { cpuGenerationPolicy, deferDraftHandDetail } from "../scripts/cpu-generation-policy.mjs";
import { draftHasHardFailure } from "../scripts/draft-approval-policy.mjs";

test("CPU drafts defer secondary hand detail only after successful contact completion", () => {
  for (const profile of ["cpu_local_fast", "cpu_local_complex"]) {
    const options = { policy: cpuGenerationPolicy(profile), profile, phase: "draft", contactSucceeded: true, relationFailed: false };
    assert.equal(deferDraftHandDetail(options), true);
    assert.equal(deferDraftHandDetail({ ...options, contactSucceeded: false }), false);
    assert.equal(deferDraftHandDetail({ ...options, relationFailed: true }), false);
    assert.equal(deferDraftHandDetail({ ...options, phase: "final" }), false);
  }
});

test("legacy, unknown policies and non-CPU recipes retain their pass schedule", () => {
  const base = { profile: "cpu_local_complex", phase: "draft", contactSucceeded: true, relationFailed: false };
  for (const policy of [undefined, null, {}, { version: "cpu-generation-2" }, { version: "cpu-generation-1", draftHandDetail: "all" }])
    assert.equal(deferDraftHandDetail({ ...base, policy }), false);
  for (const profile of ["gpu_full", "unknown", ""]) {
    assert.equal(cpuGenerationPolicy(profile), null);
    assert.equal(deferDraftHandDetail({ ...base, profile, policy: cpuGenerationPolicy("cpu_local_fast") }), false);
  }
});

test("serialized draft policy survives final promotion without deferring final refinements", () => {
  const draft = { phase: "draft", profile: "cpu_local_complex", policy: cpuGenerationPolicy("cpu_local_complex"), contactSucceeded: true, relationFailed: false };
  const stored = JSON.parse(JSON.stringify(draft));
  assert.equal(deferDraftHandDetail(stored), true);
  assert.equal(deferDraftHandDetail({ ...stored, phase: "final" }), false);
});

test("deferred optional detail does not turn existing processing failures into success", () => {
  const trace = { stage: "hand_refinement", requestStatus: "skipped", semanticStatus: "not_applied", reason: "cpu_draft_hand_detail_deferred_to_final" };
  assert.equal(draftHasHardFailure({ passTraces: [trace], postprocessWarnings: [] } as any), false);
  assert.equal(draftHasHardFailure({ passTraces: [trace], pixelQa: { status: "blocked" } } as any), true);
  assert.equal(draftHasHardFailure({ passTraces: [trace], postprocessWarnings: ["手物接触补全未应用"] } as any), true);
});
