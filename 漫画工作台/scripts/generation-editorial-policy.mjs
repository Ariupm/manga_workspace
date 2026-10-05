/** Structured generation is compiled on the server, never diffed against a stale browser preview. */
export function generationEditorialInput(body) {
  if (!['structured','forced_structured','auto_repaired'].includes(body.promptMode)) return body;
  const {promptOverride,negativePromptOverride,regionalPromptOverride,...rest}=body;
  return rest;
}
