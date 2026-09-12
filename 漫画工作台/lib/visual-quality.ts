export type VisualFailureType =
  | "count"
  | "anatomy"
  | "framing"
  | "identity"
  | "outfit"
  | "hands"
  | "prop"
  | "gaze"
  | "interaction"
  | "environment";

export type NormalizedRegion = [number, number, number, number];

export type VisualFailureEvidence = {
  type: VisualFailureType;
  evidence: string;
  region: NormalizedRegion;
  confidence: number;
};

export type VisualQualityScores = {
  identity: number;
  outfit: number;
  anatomy: number;
  interaction: number;
  gaze: number;
  framing: number;
  environment: number;
};

export type VisualQualityEvidence = {
  version: "visual-quality-v1";
  candidatePath: string;
  detector: string;
  hardFailures: VisualFailureEvidence[];
  scores: VisualQualityScores;
  summary: string;
};

export type RepairPlan = {
  version: "repair-plan-v1";
  decision: "accept" | "localized_repair" | "regenerate";
  target: "none" | "face" | "outfit" | "interaction_unit" | "background" | "whole_image";
  region: NormalizedRegion | null;
  preserve: string[];
  requirements: string[];
  sourceFailures: VisualFailureType[];
  attempt: number;
};

const clampScore = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));

export function visualQualityScore(scores: VisualQualityScores) {
  const weighted =
    clampScore(scores.anatomy) * .22 +
    clampScore(scores.interaction) * .2 +
    clampScore(scores.identity) * .17 +
    clampScore(scores.framing) * .14 +
    clampScore(scores.outfit) * .11 +
    clampScore(scores.gaze) * .1 +
    clampScore(scores.environment) * .06;
  return Math.round(weighted * 10_000) / 10_000;
}

export function selectBestVisualEvidence(items: VisualQualityEvidence[]) {
  return [...items].sort((a, b) => {
    const hardDifference = a.hardFailures.length - b.hardFailures.length;
    if (hardDifference) return hardDifference;
    return visualQualityScore(b.scores) - visualQualityScore(a.scores);
  })[0] || null;
}

const unionRegions = (regions: NormalizedRegion[]): NormalizedRegion | null => {
  if (!regions.length) return null;
  const x1 = Math.min(...regions.map((item) => item[0]));
  const y1 = Math.min(...regions.map((item) => item[1]));
  const x2 = Math.max(...regions.map((item) => item[0] + item[2]));
  const y2 = Math.max(...regions.map((item) => item[1] + item[3]));
  return [Math.max(0, x1), Math.max(0, y1), Math.min(1, x2) - Math.max(0, x1), Math.min(1, y2) - Math.max(0, y1)];
};

export function buildRepairPlan(evidence: VisualQualityEvidence, attempt = 0, maxRepairAttempts = 1): RepairPlan {
  const failures = evidence.hardFailures.filter((item) => item.confidence >= .55);
  const types = [...new Set(failures.map((item) => item.type))];
  if (!types.length) return { version: "repair-plan-v1", decision: "accept", target: "none", region: null, preserve: [], requirements: [], sourceFailures: [], attempt };
  const requiresRegeneration = types.some((type) => ["count", "anatomy", "framing"].includes(type));
  if (requiresRegeneration || attempt >= maxRepairAttempts) {
    return {
      version: "repair-plan-v1", decision: "regenerate", target: "whole_image", region: null,
      preserve: ["character asset bundle", "selected outfit", "shot contract", "environment anchors"],
      requirements: failures.map((item) => item.evidence), sourceFailures: types, attempt,
    };
  }
  const interactionTypes: VisualFailureType[] = ["hands", "prop", "gaze", "interaction"];
  const target = types.some((type) => interactionTypes.includes(type))
    ? "interaction_unit"
    : types.includes("identity") ? "face"
      : types.includes("outfit") ? "outfit"
        : "background";
  const related = failures.filter((item) => target === "interaction_unit" ? interactionTypes.includes(item.type) : target === "face" ? item.type === "identity" : target === "outfit" ? item.type === "outfit" : item.type === "environment");
  return {
    version: "repair-plan-v1", decision: "localized_repair", target, region: unionRegions(related.map((item) => item.region)),
    preserve: target === "face"
      ? ["pose", "hands", "prop", "outfit", "camera", "environment"]
      : target === "outfit"
        ? ["identity", "pose", "hands", "prop", "camera", "environment"]
        : target === "interaction_unit"
          ? ["identity outside face overlap", "outfit outside repair region", "camera", "environment"]
          : ["characters", "identity", "outfit", "pose", "interaction"],
    requirements: related.map((item) => item.evidence), sourceFailures: types, attempt,
  };
}
