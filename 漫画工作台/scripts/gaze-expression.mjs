/** Convert a gaze target to a visual instruction without inventing head geometry. */
export function gazeInstruction(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const weighted = text.match(/^\((.*):([0-9.]+)\)$/s);
  if (weighted) return `(${gazeInstruction(weighted[1])}:${weighted[2]})`;
  // Keep authored eye/head actions, closed eyes and negative instructions intact.
  if (/\b(?:closed|shut)\s+eyes\b/i.test(text)) return text;
  if (/\b(?:eyes?|pupils?|eyelids?|head)\s+(?:(?:are|is)\s+)?(?:(?:gently|softly|partly|half)\s+)?(?:closed|shut|open|turned|directed|fixed|focused|lowered|raised|facing|following)\b/i.test(text)) return text;
  if (/\b(?:look(?:s|ing)?|gaze|gazing|star(?:e|es|ing)|watch(?:es|ing)?|focus(?:ed|ing)?|eye contact|no|not|away from)\b/i.test(text)) return text;
  if (/^(?:left|right|up|down|upward|downward|ahead|forward|backward|upwards|downwards)$/i.test(text)) return `looking ${text}`;
  if (/^(?:left|right|up|down|ahead|forward)\s+(?:at|towards?|past)\b/i.test(text)) return `looking ${text}`;
  if (/^(?:towards?|at|to the|over|under)\b/i.test(text)) return `looking ${text}`;
  return `eyes focused on ${text}`;
}

// A local face crop may exclude its target. Project the already resolved
// direction, never arbitrary worker prose, and never override authored gaze.
export function gazeExecutionCues(gaze = '', direction = '') {
  const text = String(gaze).toLowerCase();
  const mode = String(direction).replace(/_/g, '-');
  if (!text.trim() || /\b(?:closed|shut)\s+eyes|\beyes?\s+(?:(?:are|is|gently|softly|partly|half)\s+)*(?:closed|shut)\b/.test(text)) return {positive:'', negative:''};
  if (/\b(?:camera|viewer|audience)\b|\beye contact\b/.test(text)) return {positive:'', negative:''};
  const directions = {down:'downward',up:'upward',left:'left',right:'right','down-left':'downward and left','down-right':'downward and right','up-left':'upward and left','up-right':'upward and right'};
  if (!directions[mode]) return {positive:'',negative:''};
  // Explicit authored eye directions outrank projected target geometry.
  const explicit = [...text.matchAll(/\b(?:looking|gazing|directed|focused|turned)\s+(?:(?:to|toward|towards|the)\s+)*(up(?:ward)?s?|down(?:ward)?s?|left|right)\b/g)].map(m=>m[1].replace(/wards?$/, ''));
  if (explicit.some(d=>!mode.split('-').includes(d))) return {positive:'',negative:''};
  return {positive:`eyes directed ${directions[mode]}, pupils directed ${directions[mode]}, natural eyelids following the gaze direction`,negative:'looking at viewer, eye contact with camera, front-facing portrait gaze, pupils aimed at camera'};
}

/** A rear/side camera view does not require the whole face to face the camera. */
export function viewCompatibleVisibility(value = '', position = '', gaze = '') {
  if (!/\b(?:profile|side view|back view|rear view)\b/i.test(position)) return value;
  if (/\b(?:looking|gazing|focused|gaze)\s+(?:at|on|towards?)\s+(?:the\s+)?(?:camera|viewer)\b/i.test(gazeInstruction(gaze))) return value;
  return value.replace(/\bface and upper body clearly visible\b/gi, 'upper body clearly visible, only the portion of the face visible from the declared camera angle')
    .replace(/\b(?:entire |full )?face clearly visible\b/gi, 'only the portion of the face visible from the declared camera angle');
}
