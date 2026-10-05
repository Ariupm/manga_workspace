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

/** A rear/side camera view does not require the whole face to face the camera. */
export function viewCompatibleVisibility(value = '', position = '', gaze = '') {
  if (!/\b(?:profile|side view|back view|rear view)\b/i.test(position)) return value;
  if (/\b(?:looking|gazing|focused|gaze)\s+(?:at|on|towards?)\s+(?:the\s+)?(?:camera|viewer)\b/i.test(gazeInstruction(gaze))) return value;
  return value.replace(/\bface and upper body clearly visible\b/gi, 'upper body clearly visible, only the portion of the face visible from the declared camera angle')
    .replace(/\b(?:entire |full )?face clearly visible\b/gi, 'only the portion of the face visible from the declared camera angle');
}
