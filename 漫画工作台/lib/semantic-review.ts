export type SemanticReviewPriority = "P0" | "P1" | "P2";

export type SemanticReviewItem = {
  id: string;
  label: string;
  priority: SemanticReviewPriority;
  required: boolean;
  expectation: string;
  sources: string[];
};

export type SemanticReviewSubmission = {
  version: "semantic-review-v1";
  verdicts: Record<string, "pass" | "fail">;
  notes?: string;
  overallConfirmed?: boolean;
};

export type SemanticReviewBinding = {
  source?: "manual_draft_approval" | "manual_final_approval" | "manual_overall_confirmation";
  stage?: "draft" | "final";
  imageSha256?: string;
  recipeHash?: string;
};

const legacyLabels: Record<string, Omit<SemanticReviewItem, "id">> = {
  interaction_review_required: { label: "关键交互", priority: "P0", required: true, expectation: "人物、手部与剧情对象形成明确且正确的交互", sources: ["legacy semanticQa label"] },
  gaze_review_required: { label: "视线方向", priority: "P0", required: true, expectation: "头部和双眼看向剧情目标，不误看镜头", sources: ["legacy semanticQa label"] },
  framing_review_required: { label: "景别裁切", priority: "P0", required: true, expectation: "实际画面景别和裁切符合镜头规格", sources: ["legacy semanticQa label"] },
  pose_review_required: { label: "动作姿势", priority: "P0", required: true, expectation: "身体姿势清楚表达当前剧情动作", sources: ["legacy semanticQa label"] },
};

export function normalizeSemanticReviewItems(semanticQa: unknown): SemanticReviewItem[] {
  if (!semanticQa || typeof semanticQa !== "object") return [];
  const qa = semanticQa as { items?: unknown; labels?: unknown };
  if (Array.isArray(qa.items)) {
    return qa.items.filter((item): item is SemanticReviewItem => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<SemanticReviewItem>;
      return typeof value.id === "string" && typeof value.label === "string" && ["P0", "P1", "P2"].includes(String(value.priority)) && typeof value.expectation === "string";
    }).map((item) => ({ ...item, required: item.required !== false, sources: Array.isArray(item.sources) ? item.sources.map(String) : [] }));
  }
  if (!Array.isArray(qa.labels)) return [];
  return qa.labels.map(String).map((id) => legacyLabels[id] ? ({ id, ...legacyLabels[id] }) : ({ id, label: id, priority: "P0" as const, required: true, expectation: "确认该语义要求已在画面中正确执行", sources: ["legacy semanticQa label"] }));
}

export function validateSemanticReviewSubmission(
  items: SemanticReviewItem[],
  submission: unknown,
  binding: SemanticReviewBinding = {},
) {
  if (!items.length) return { valid: true as const, errors: [] as string[], approval: null };
  if (!submission || typeof submission !== "object")
    return { valid: false as const, errors: ["该草稿包含语义质检项，必须提交逐项审核结果"], approval: null };
  const value = submission as Partial<SemanticReviewSubmission>;
  if (value.version !== "semantic-review-v1" || !value.verdicts || typeof value.verdicts !== "object")
    return { valid: false as const, errors: ["语义质检提交版本或逐项结果无效"], approval: null };
  const errors: string[] = [];
  const verdicts: Record<string, "pass" | "fail"> = {};
  if (value.overallConfirmed) {
    return {
      valid: true as const,
      errors,
      approval: {
        version: "semantic-review-v1" as const,
        source: binding.source || "manual_overall_confirmation",
        stage: binding.stage || "draft",
        ...(binding.imageSha256 ? { imageSha256: binding.imageSha256 } : {}),
        ...(binding.recipeHash ? { recipeHash: binding.recipeHash } : {}),
        approvedAt: new Date().toISOString(),
        verdicts,
        notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 1000) : "",
        reviewMode: "overall_confirmation",
        reviewedItems: [],
        reviewContractSnapshot: items,
      },
    };
  }
  for (const item of items) {
    const verdict = value.verdicts[item.id];
    if (item.required && verdict !== "pass" && verdict !== "fail") errors.push(`缺少“${item.label}”的通过/失败结论`);
    if (verdict === "fail") errors.push(`“${item.label}”未通过，必须拒绝草稿并重做`);
    if (verdict === "pass" || verdict === "fail") verdicts[item.id] = verdict;
  }
  const known = new Set(items.map((item) => item.id));
  for (const id of Object.keys(value.verdicts)) if (!known.has(id)) errors.push(`提交了未知质检项：${id}`);
  return {
    valid: errors.length === 0,
    errors,
    approval: errors.length ? null : {
      version: "semantic-review-v1" as const,
      source: binding.source || "manual_draft_approval",
      stage: binding.stage || "draft",
      ...(binding.imageSha256 ? { imageSha256: binding.imageSha256 } : {}),
      ...(binding.recipeHash ? { recipeHash: binding.recipeHash } : {}),
      approvedAt: new Date().toISOString(),
      verdicts,
      notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 1000) : "",
      reviewedItems: items.map((item) => ({ id: item.id, label: item.label, priority: item.priority, required: item.required, expectation: item.expectation, sources: item.sources })),
    },
  };
}
