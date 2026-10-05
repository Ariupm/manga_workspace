import type { Shot } from "./types";
import { rankInteractionPropCandidates } from "./interaction-prop";

/** Conservative fallback: only explicit single-actor attention in unplanned prose. */
export function storyGazeFallback(shot: Shot, characterId: string): string {
  if (shot.visualSpecConfirmed || shot.characterIds.length !== 1 || shot.characterIds[0] !== characterId) return "";
  const saved = shot.characterLooks?.[characterId];
  if (saved?.gazeEn?.trim() || saved?.actionEn?.trim()) return "";
  const description = shot.description || "";
  // Multiple time steps and negation require structured planning, not a guess.
  if (/没有|并未|不(?:再|是|想|愿|看|低头|注视)|没(?:有|看|低头)|然后|随后|接着|\b(?:not|never|then|afterwards)\b/i.test(description)) return "";
  const clauses = description.split(/[，。；,;.!]/).filter(clause => /低头.{0,6}(?:看|注视)|(?:看着|看向|注视)|\blook(?:s|ing)?\s+(?:down\s+)?at\b|\bgaz(?:e|es|ing)\s+at\b/i.test(clause));
  if (clauses.length !== 1) return "";
  const clause = clauses[0];
  const candidates = rankInteractionPropCandidates({ target: "", action: "", contact: "", gaze: clause, facts: "", context: "" });
  if (candidates.length !== 1) return "";
  const nouns: Record<string, string> = { smartphone: "smartphone screen", book_or_document: "book or document", package: "parcel", drink_container: "drink container", food_container: "food container", handheld_tool: "handheld tool" };
  const target = nouns[candidates[0].propId] || candidates[0].propId.replace(/_/g, " ");
  const down = /低头|look(?:s|ing)?\s+down/i.test(clause);
  return `${down ? "head tilted down, eyes looking downward at" : "head and eyes focused on"} the ${target}, no eye contact with camera`;
}
