const genericInteractionTarget = /^(?:the )?(?:current )?(?:story|interaction|action) (?:focus|target)|^(?:the )?current story focus$/i;
const propSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "");

type InteractionPropEvidence = {
  target?: string;
  action?: string;
  contact?: string;
  gaze?: string;
  facts?: string;
  context?: string;
  targetIsCharacter?: boolean;
};

type InteractionPropCandidate = {
  propId: string;
  score: number;
  contactPoints: string[];
  firstMention: number;
};

type InteractionPropCatalogEntry = {
  propId: string;
  pattern: RegExp;
  role: "tool" | "portable" | "container" | "document";
  generic?: boolean;
};

// The catalog only recognizes aliases. Selection is score-based below; array
// position is deliberately not a priority signal. Keep tools specific so a
// structured "scissors" fact is not weakened to an anonymous handheld tool.
const interactionPropCatalog: InteractionPropCatalogEntry[] = [
  { propId: "smartphone", pattern: /smartphone|phone screen|mobile phone|cell phone|手机/i, role: "portable" },
  { propId: "umbrella", pattern: /umbrella|parasol|雨伞/i, role: "portable" },
  { propId: "book_or_document", pattern: /book|document|letter|page|magazine|notebook|书|文件|信件|纸张/i, role: "document" },
  { propId: "package", pattern: /package|parcel|delivery box|快递|包裹/i, role: "container" },
  { propId: "scissors", pattern: /scissors|shears|剪刀/i, role: "tool" },
  { propId: "screwdriver", pattern: /screwdriver|螺丝刀/i, role: "tool" },
  { propId: "hammer", pattern: /hammer|锤子|榔头/i, role: "tool" },
  { propId: "wrench", pattern: /wrench|spanner|扳手/i, role: "tool" },
  { propId: "pliers", pattern: /pliers|钳子/i, role: "tool" },
  { propId: "pen", pattern: /\bpen\b|钢笔|签字笔/i, role: "tool" },
  { propId: "pencil", pattern: /pencil|铅笔/i, role: "tool" },
  { propId: "brush", pattern: /\bbrush\b|画笔|刷子/i, role: "tool" },
  { propId: "knife", pattern: /\bknife\b|小刀|刀具/i, role: "tool" },
  { propId: "handheld_tool", pattern: /handheld tool|\btool\b|工具/i, role: "tool", generic: true },
  { propId: "drink_container", pattern: /cup|mug|glass|bottle|杯子|水杯|瓶子/i, role: "container" },
  { propId: "bag", pattern: /handbag|backpack|purse|\bbag\b|手提包|背包/i, role: "container" },
  { propId: "food_container", pattern: /bowl|plate|food container|碗|盘子/i, role: "container" },
];

const propMentionIndex = (value: string, pattern: RegExp) => value.search(pattern);
const propContactClauses = (value: string, pattern: RegExp) => value
  .split(/\s*(?:[,;]|\bwhile\b|\bwhereas\b|\band\b(?=\s+(?:the\s+)?(?:left|right|both)\s+hands?))\s*/i)
  .map((item) => item.trim())
  .filter((item) => item && pattern.test(item));

const localActionRoleScore = (action: string, pattern: RegExp, role: InteractionPropCatalogEntry["role"]) => {
  const index = propMentionIndex(action, pattern);
  if (index < 0) return 0;
  const prefix = action.slice(Math.max(0, index - 48), index).toLowerCase();
  let score = 0;
  if (/(?:\bwith|\busing|\bvia|\bby means of|用|使用)\s+(?:(?:an?|the)\s+)?[^,;]{0,12}$/i.test(prefix)) score += 140;
  if (/(?:\bhold(?:ing|s|held)?|\bgrip(?:ping|s|ped)?|\buse|\busing|\boperate|\boperating|\bwield(?:ing)?|\bcarry(?:ing)?|\bread(?:ing)?|\bdrink(?:ing)?|拿|握|持|操作|使用|阅读|喝)\s+(?:(?:an?|the)\s+)?[^,;]{0,18}$/i.test(prefix)) score += 75;
  if (role === "tool" && /\b(?:cut|cutting|snip|trim|tighten|screw|hammer|repair|write|draw|paint|slice|open)\b|剪|切|拧|修理|书写|画/i.test(action)) score += 60;
  return score;
};

/**
 * Rank story props by structured semantic evidence. This is shared by visual
 * normalization and prompt compilation so neither path falls back to the
 * order of a keyword array when an action mentions several objects.
 */
export function rankInteractionPropCandidates(evidence: InteractionPropEvidence): InteractionPropCandidate[] {
  const target = String(evidence.target || "").trim();
  const action = String(evidence.action || "").trim();
  const contact = String(evidence.contact || "").trim();
  const gaze = String(evidence.gaze || "").trim();
  const facts = String(evidence.facts || "").trim();
  const context = String(evidence.context || "").trim();
  const mentionSource = [action, contact, target, gaze, facts, context].join(" ");
  const candidates = interactionPropCatalog.flatMap((entry): InteractionPropCandidate[] => {
    const inTarget = !evidence.targetIsCharacter && propMentionIndex(target, entry.pattern) >= 0;
    const inAction = propMentionIndex(action, entry.pattern) >= 0;
    const contactPoints = propContactClauses(contact, entry.pattern);
    const inGaze = propMentionIndex(gaze, entry.pattern) >= 0;
    const inFacts = propMentionIndex(facts, entry.pattern) >= 0;
    const inContext = propMentionIndex(context, entry.pattern) >= 0;
    if (!inTarget && !inAction && !contactPoints.length && !inGaze && !inFacts && !inContext) return [];
    let score = 0;
    if (inTarget) score += 60 + (target.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() === entry.propId ? 30 : 0);
    if (inAction) score += 40 + localActionRoleScore(action, entry.pattern, entry.role);
    if (contactPoints.length) score += 90 + (/\b(?:left|right|both)\s+hands?\b|左手|右手|双手/i.test(contactPoints.join(" ")) ? 30 : 0);
    if (inGaze) score += 20;
    if (inFacts) score += 12;
    if (inContext) score += 4;
    if (entry.generic) score -= 10;
    return [{ propId: entry.propId, score, contactPoints, firstMention: Math.max(0, propMentionIndex(mentionSource, entry.pattern)) }];
  });
  if (!candidates.length && target && !genericInteractionTarget.test(target) && !evidence.targetIsCharacter) {
    return [{ propId: propSlug(target), score: 60, contactPoints: [], firstMention: 0 }];
  }
  if (!candidates.length) {
    const described = `${action} ${contact} ${facts}`.match(/\b(?:hold(?:ing)?|read(?:ing)?|us(?:e|ing)|operat(?:e|ing)|inspect(?:ing)?|carry(?:ing)?|open(?:ing)?)\s+(?:a|an|the)?\s*([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})/i)?.[1] || "";
    if (described && !genericInteractionTarget.test(described)) return [{ propId: propSlug(described), score: 35, contactPoints: [], firstMention: 0 }];
  }
  return candidates.sort((left, right) => right.score - left.score || left.firstMention - right.firstMention || left.propId.localeCompare(right.propId));
}
