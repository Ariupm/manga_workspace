// Missing optional hand contours is an unavailable repair, not a detected pixel failure.
export function draftHasHardFailure(recipe = {}) {
  return recipe.pixelQa?.status === "blocked" || recipe.semanticQa?.status === "blocked"
    || (recipe.postprocessWarnings || []).some((warning) =>
      !String(warning).startsWith("手部深度修复未应用，已保留道具阶段图片：所有可用手部检测器均未返回可用轮廓"));
}
