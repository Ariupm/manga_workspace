/** Shared basic posture semantics. Environment words are not posture evidence. */
export type BasicTemplateId = 'stand'|'sit'|'crouch'|'kneel_single'|'kneel_double'|'recline'|'lie_supine'|'lie_side'|'lie_prone';
export function positivePoseText(text: string) {
  return text.replace(/\b(?:not|never|without)\s+(?:sitting|seated|standing|kneeling|lying|reclining|crouching|squatting)\b/gi, '')
    .replace(/(?:没有|并非|不是|不再|不要|未)(?:坐着|坐下|站着|跪着|躺着|蹲着|坐|站|跪|躺|蹲)/g, '');
}
export function basicTemplateFromText(text: string): BasicTemplateId | undefined {
  const s=positivePoseText(text);
  if (/\b(?:lying|lie|lies|lay|supine|prone)\b|躺|平卧|卧倒|仰卧|侧卧|俯卧/.test(s.toLowerCase())) {
    if (/prone|face[- ]down|俯卧/i.test(s)) return 'lie_prone';
    if (/\b(?:supine|face\s+up|on\s+(?:the\s+)?back)\b|仰卧|平躺/.test(s.toLowerCase())) return 'lie_supine';
    return /\b(?:on\s+(?:one|the|her|his|their)\s+side|side[- ]lying|lying\s+sideways)\b|侧躺|侧卧/.test(s.toLowerCase())?'lie_side':'lie_supine';
  }
  if (/reclin|lean(?:ing|s)?\s+back|斜靠|倚靠|半躺|后靠/i.test(s)) return 'recline';
  if (/\bkneel(?:ing)?\b|跪/i.test(s)) return /both\s+knees|two\s+knees|双膝|双腿跪/i.test(s)?'kneel_double':'kneel_single';
  if (/\b(?:crouch(?:ing)?|squat(?:ting)?)\b|蹲/i.test(s)) return 'crouch';
  if (/\b(?:sit|sits|sitting|seated)\b|坐/i.test(s)) return 'sit';
  if (/\bstand(?:ing)?\b|站/i.test(s)) return 'stand';
  return undefined;
}
export function basicFamilyForTemplate(id: BasicTemplateId) {
  return ({stand:'static',sit:'seated',crouch:'crouch_kneel',kneel_single:'crouch_kneel',kneel_double:'crouch_kneel',recline:'recline',lie_supine:'lie',lie_side:'lie',lie_prone:'lie'} as const)[id];
}
