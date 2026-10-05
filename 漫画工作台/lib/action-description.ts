/** Built-in panel-planning instructions describe what to plan, not an actor's action. */
export function isNarrativeActionInstruction(value: unknown): boolean {
  return typeof value === "string" && /^(?:establish the exact starting positions|show the active character beginning|show the other character's immediate visible reaction|reveal the key prop, contact point|show the visible result with changed character)/i.test(value.trim().replace(/\s+/g, " "));
}

/** Preserve priority among concrete values and retain unresolved instructions for the input gate. */
export function resolveActionDescription(...values: unknown[]): string {
  const supplied = values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return (supplied.find(value => !isNarrativeActionInstruction(value)) || supplied[0] || "").trim();
}
