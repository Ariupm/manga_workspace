import type { Shot, VisualValidationResult } from "./types";

export type CandidateQualityStatus = "passed" | "needs_review" | "blocked";

export type CandidateQualityGate = {
  status: CandidateQualityStatus;
  blockers: string[];
  warnings: string[];
  labels: string[];
};

/**
 * Candidate-level gate. Pixel detectors can be added later without changing
 * the API contract; structural P0 failures are blocked immediately.
 */
export function evaluateCandidateGate(
  shot: Pick<Shot, "characterIds" | "visualSpec" | "visualSpecConfirmed">,
  validation?: VisualValidationResult,
): CandidateQualityGate {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const labels: string[] = [];
  if (!shot.characterIds.length) {
    blockers.push("count_failed:镜头没有出场人物");
    labels.push("count_failed");
  }
  if (shot.visualSpecConfirmed && !shot.visualSpec) {
    blockers.push("interaction_failed:视觉规格已确认但内容为空");
    labels.push("interaction_failed");
  }
  for (const failure of validation?.failures || []) {
    labels.push(failure.code);
    if (failure.severity === "P0") blockers.push(`${failure.code}:${failure.message}`);
    else warnings.push(`${failure.code}:${failure.message}`);
  }
  if (!shot.visualSpecConfirmed) warnings.push("visual_spec_unconfirmed:尚未确认结构化视觉规格");
  return {
    status: blockers.length ? "blocked" : warnings.length ? "needs_review" : "passed",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    labels: [...new Set(labels)],
  };
}
