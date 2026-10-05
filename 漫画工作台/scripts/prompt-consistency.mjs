import {relationActionState} from './action-stage-policy.mjs';

export const PROMPT_CONSISTENCY_VERSION = 'prompt-consistency-1';
const plain = value => String(value || '').toLowerCase().replace(/[()]/g,'').replace(/:\d+(?:\.\d+)?/g,'').replace(/\s+/g,' ').trim();
const terms = text => plain(text).split(/[,;]|\s+break\s+/).map(s=>s.trim()).filter(Boolean);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const posture = text => [...new Set((plain(text).match(/\b(?:sitting|seated|standing|crouching|kneeling|reclining|lying)\b/g)||[]).map(t=>t==='seated'?'sitting':t))];

/** Compare semantic facts only: execution projection is allowed to change points. */
export function relationSemanticSignature(r) {
  const state=relationActionState(r);
  return JSON.stringify({characterId:r.characterId,object:r.object,instance:r.objectInstanceId,count:r.expectedCount||1,
    action:state?.actionId,phase:state?.phase,contact:state?.contactState,hand:r.activeHand,handMode:r.handMode,
    support:r.visualFacts?.support,workTarget:r.visualFacts?.workTarget,
    gaze:r.visualFacts?.gaze||r.gaze});
}

/** Bounded checks of explicit facts; this is not an arbitrary language reasoner. */
export function promptConsistencyErrors({prompt='',negative='',person,relations=[]}={}) {
  const errors=[],positive=plain(prompt),negatives=terms(negative);
  for(const term of terms(prompt))if(negatives.includes(term))errors.push(`positive/negative conflict: ${term}`);
  // Concrete exclusions (not abstract "wrong hair colour") must not veto facts.
  for(const term of negatives){
    if(!/^(?:[a-z-]+ (?:hair|eyes)|glasses|bag|outerwear|rain|snow|looking at (?:viewer|camera)|eye contact with (?:viewer|camera))$/.test(term))continue;
    if(new RegExp(`\\b${escape(term)}\\b`).test(positive))errors.push(`positive/negative conflict: ${term}`);
  }
  if(!person)return [...new Set(errors)];
  const identity=plain(person.fields.filter(f=>f.group==='identity').map(f=>f.text).join(', '));
  for(const pattern of [/\b(black|brown|pink|red|blue|green|white|silver|purple|blonde?|gr[ae]y) hair\b/g,/\b(short|long|waist-length|shoulder-length) (?:layered |straight |curly )?hair\b/g,/\b(black|brown|pink|red|blue|green|white|silver|purple|hazel|amber|gr[ae]y) eyes\b/g]){
    const values=[...identity.matchAll(pattern)].map(m=>m[1]);
    if(values.length)for(const m of positive.matchAll(pattern))if(!values.includes(m[1]))errors.push(`${person.characterId}: identity attribute conflicts with ${m[0]}`);
  }
  const expected=person.fields.filter(f=>['pose'].includes(f.group)).map(f=>f.text).join(', ');
  const expectedPoses=posture(expected),actualPoses=posture(prompt);
  if(expectedPoses.length===1&&actualPoses.some(p=>!expectedPoses.includes(p)))errors.push(`${person.characterId}: body posture differs from effective facts`);
  const gaze=plain(person.fields.filter(f=>f.group==='gaze').map(f=>f.text).join(', '));
  const camera=/\b(?:looking|gazing) (?:directly )?(?:at|towards?) (?:the )?(?:viewer|camera)\b|eye contact with (?:the )?(?:viewer|camera)/;
  if(gaze&&!camera.test(gaze)&&camera.test(positive))errors.push(`${person.characterId}: camera gaze conflicts with effective target`);
  for(const r of relations.filter(r=>r.characterId===person.characterId&&r.required)){
    const state=relationActionState(r),object=plain(r.object);
    if(!state||!object)continue;
    // Repeated object classes are disambiguated by structured instance/hand IDs,
    // not by borrowing another clause's number or phase from the same noun.
    if(relations.filter(other=>other.required&&other.characterId===person.characterId&&plain(other.object)===object).length>1)continue;
    const countPattern=new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|\\d+) (?:${object==='scissors'?'pair of ':''})${escape(object)}(?:s|es)?\\b`,'g');
    for(const m of positive.matchAll(countPattern)){
      const count=({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10})[m[1]]||Number(m[1]);
      if(count!==(r.expectedCount||1))errors.push(`${r.relationId}: object count conflicts with effective facts`);
    }
    for(const term of terms(prompt).filter(t=>t.includes(object))){
      // Restrict the check to a direct hand/object assertion in this clause.
      if(new RegExp(`\\b(?:holding|gripping|touching|contacting) (?:the |a |an )?${escape(object)}\\b`).test(term)&&['approach','released'].includes(state.contactState))errors.push(`${r.relationId}: contact conflicts with ${state.contactState}`);
      if(state.contactState==='contact'&&new RegExp(`\\bhand(?:s)? approaching (?:the )?${escape(object)}\\b`).test(term))errors.push(`${r.relationId}: approach conflicts with contact`);
    }
  }
  return [...new Set(errors)];
}

export function factSetConsistencyErrors(facts) {
  const errors=[];
  for(const person of facts.characters){
    const owned=facts.relations.filter(r=>r.required&&r.characterId===person.characterId&&r.visualFacts);
    const gazes=owned.map(r=>r.visualFacts.gaze).filter(Boolean);
    const targets=new Set(gazes.map(g=>g.kind==='independent'?`independent:${plain(g.description)}`:`${g.kind}:${g.targetId}`));
    if(targets.size>1)errors.push(`${person.characterId}: multiple simultaneous gaze targets`);
    const poses=posture(person.fields.filter(f=>f.group==='pose').map(f=>f.text).join(', '));
    if(poses.length>1)errors.push(`${person.characterId}: multiple simultaneous body postures`);
    for(const r of owned){
      const state=relationActionState(r),f=r.visualFacts;
      if(state&&(state.actionId!==f.actionId||state.phase!==f.phase||state.contactState!==f.contact.state))errors.push(`${r.relationId}: action snapshot disagrees with visual facts`);
      if(['held','on_support'].includes(state?.objectState)&&state.objectState!==f.support.state)errors.push(`${r.relationId}: object support disagrees with action phase`);
    }
  }
  return errors;
}
