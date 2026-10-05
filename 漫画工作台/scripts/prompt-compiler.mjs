import { actionContactTerms, contactPassAllowed, synchronizedActionTerms, relationActionState, actionStageVerb } from './action-stage-policy.mjs';

export const PROMPT_COMPILER_VERSION = 'comic-facts-1';
export const ART_STYLE = 'anime illustration, clean line art, soft cel shading';
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
// Browser/API/worker share this deterministic audit fingerprint (not security).
const hash = value => { let n = 2166136261; for (const c of JSON.stringify(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0).toString(16).padStart(8, '0'); };
export function promptTerms(value) {
  const result = []; let part = '', depth = 0;
  for (const c of String(value || '')) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if ((c === ',' || c === ';') && depth === 0) {
      if (clean(part)) result.push(clean(part)); part = '';
    } else part += c;
  }
  if (clean(part)) result.push(clean(part));
  return result;
}
const key = value => clean(value).toLowerCase().replace(/[()]/g, '').replace(/:\d+(?:\.\d+)?/g, '').replace(/\b(?:clear|clearly|consistent|canonical|natural|established|declared)\s+/g, '').trim();
export const uniquePrompt = value => [...new Map(promptTerms(value).map(term => [key(term), term])).values()].join(', ');

/** Concrete object and count belong to the actor's action, never background mentions. */
export function resolvePropVisualFacts(object, action = '') {
  const generic = /^(?:book[_ ]or[_ ]document|drink[_ ]container|food[_ ]container)$/i.test(object);
  const families = /book|document/i.test(object) ? ['notebook','magazine','document','letter','novel','book']
    : /drink[_ ]container/i.test(object) ? ['bottle','mug','cup','glass']
    : /food[_ ]container/i.test(object) ? ['bowl','plate'] : [object];
  const noun = generic ? families.find(n=>new RegExp(`\\b${n}(?:s|es)?\\b`,'i').test(action)) || object.replace(/_/g,' ') : object;
  const count = explicitPropCount(noun,action) ?? 1;
  return {object:noun,expectedCount:count};
}
function explicitPropCount(noun,text) {
  const escaped=noun.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Accept authored noun modifiers without a colour/material whitelist. Never
  // carry a quantity across a clause, support preposition or another number.
  const modifier = '(?!(?:and|or|then|while|with|without|from|to|on|in|at|of|beside|near|behind|above|below|under|over|holding|touching|taking|one|two|three|four|five|six|seven|eight|nine|ten)\\b)[a-z][a-z-]*';
  const match=text.match(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(?:${modifier}\\s+){0,8}${escaped}(?:s|es)?\\b`,'i'));
  return match ? ({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[match[1].toLowerCase()] ?? Number(match[1])) : null;
}
export function propVisualLabel(relation) {
  const count = relation.expectedCount || 1, noun = relation.object;
  const plural = /(?:scissors|pliers|s)$/i.test(noun) ? noun : /(?:box|glass)$/i.test(noun) ? `${noun}es` : `${noun}s`;
  return count === 1 ? `one ${noun}` : `${{2:'two',3:'three',4:'four',5:'five'}[count] || count} ${plural}`;
}
export function transferSupportLabel(action, context='') {
  const authored=action.match(/\b(?:from|on|onto|off)\s+(?:(?:a|an|the)\s+)?(?:open\s+)?(package|parcel|box|table|shelf|counter|desk|floor|ground)\b/i);
  if(authored)return authored[1].toLowerCase();
  // Only a single-actor caller supplies prose fallback; never borrow another
  // actor's support or a mere background object mention.
  if(/从[^，。;]{0,8}(?:包裹|快递盒|箱子)(?:里|中)?[^，。;]{0,8}(?:拿出|取出)/.test(context))return 'package';
  return '';
}

/** Keep authored upper garment details; hidden lower garments stay in asset facts. */
export function visibleClothingText(value, camera) {
  if (/wide shot|full shot|long shot/i.test(camera)) return value;
  return promptTerms(value.replace(/\b(?:with|and|paired with|over)\s+(?=(?:a\s+)?[^,;]{0,35}\b(?:skirt|pants|trousers|jeans|shorts|shoes|sneakers|boots)\b)/gi, ', '))
    .filter(term=>! /\b(?:skirt|pants|trousers|jeans|shorts|shoes|sneakers|boots|socks)\b/i.test(term))
    .map(term=>/\b(?:dress|gown|jumpsuit)\b/i.test(term) ? `upper portion of ${term.replace(/\b(?:midi|maxi|floor-length|knee-length)\s+/gi,'')}` : term).join(', ');
}

export function relationVisualText(relation, stage = 'prop') {
  const state = relationActionState(relation);
  if (!relation?.required) return '';
  const hands = relation.handMode === 'two' ? 'both hands' : `${relation.activeHand || 'acting'} hand`;
  if(relation.visualFacts){
    const f=relation.visualFacts,object=relation.object;
    const working=['tool','write'].includes(state?.actionId)&&f.workTarget&&relation.workTargetLabel;
    const actionObject=relation.expectedCount>1?propVisualLabel(relation).replace(/^\S+\s+/,''):object;
    const label=object==='scissors'&&relation.expectedCount===1?'one pair of scissors':propVisualLabel(relation);
    const contact=state?.contactState==='approach'?`${hands} approaching the ${object} with a visible gap`:state?.contactState==='released'?`${hands} separated from the ${object}`:working?`${hands} gripping the ${object} ${f.contact.part}`:`${hands} ${relation.actionPlan?.geometry?.mechanism==='support'?'stabilizing':'touching'} the ${f.contact.part} of the ${object}`;
    const operation=working&&state?.phase==='contact'?`${object} ${f.workTarget.operation} the ${f.workTarget.surface} on the ${relation.workTargetLabel}`:
      state?.phase==='contact'&&relation.actionPlan?.geometry?.mechanism!=='support'?relation.actionPlan?.evidence||`${({hold:'holding',inspect:'inspecting',drink:'drinking from',carry:'carrying',touch:'touching',read:'reading'})[f.actionId]||actionStageVerb(state?.actionId,state?.phase)} the ${actionObject}`:
      state&&relation.actionPlan?.geometry?.mechanism!=='support'?`${actionStageVerb(state.actionId,state.phase)} the ${actionObject}`:'';
    const support=stage!=='hand'&&f.support.state==='on_support'?`${object} resting on the ${f.support.label}`:'';
    return uniquePrompt([stage==='hand'?'':label,operation,contact,support].filter(Boolean).join(', '));
  }

  const label = propVisualLabel(relation), object = (relation.expectedCount||1)>1 ? label.replace(/^\S+\s+/,'') : relation.object;
  const contact = state?.contactState === 'approach' ? `${hands} approaching the ${object} with a visible gap`
    : state?.contactState === 'released' ? `${object} on its support, hands separated from the ${object}`
    : `${hands} contacting the ${object}`;
  // Structured state is authoritative. Legacy positives can contain stale
  // approach/reading/count commands, so do not copy their protocol wholesale.
  const geometry = relation.actionRelationAudit?.geometry || relation.actionPlan?.geometry;
  const visualTerms = geometry?.mechanism === 'transfer' ? [] : synchronizedActionTerms(relation).filter(term => !/required story prop|story instance|interaction purpose|surface and exclusion|exclusion regions|wrist anchors|normalized|orientation determined|visible surface follows|action stage|action in progress|before contact|completed action|object position consistent|hands? physically|acting hand at|hand approaching|object remains|object is held|\(.*eyes focused/i.test(term));
  const support=relation.supportLabel ? `the ${relation.supportLabel}` : 'a support surface';
  const supportState = state?.objectState === 'action_specific' ? relation.visualFacts?.support.state : state?.objectState;
  const supported = supportState === 'on_support' ? `${object} resting on ${support}` : supportState === 'held' ? relation.supportLabel?`${object} held above the ${relation.supportLabel}`:`${object} held in ${hands}` : '';
  const affordance = relation.visualFacts || state && ['pick','place'].includes(state.actionId) ? '' : relation.affordance;
  const coverContact = state?.contactState === 'contact' && /touch(?:ing)?[^.;]*covers?/i.test(relation.actionPlan?.evidence || '') ? `fingertips touching the ${relation.object} covers` : '';
  return [stage === 'hand' && (relation.expectedCount||1)===1 ? '' : label, state && state.contactState !== 'contact' ? '' : affordance,
    relation.visualFacts && state?.phase==='contact' && ['tool','open','close','write','push','pull'].includes(state.actionId) ? relation.actionPlan?.evidence : '',
    contact, relation.visualFacts && state?.contactState==='contact' ? `${hands} touching the ${relation.visualFacts.contact.part} of the ${object}` : '',
    ...(stage === 'hand' && contactPassAllowed(relation) ? coverContact || relation.visualFacts ? [] : actionContactTerms(relation) : visualTerms),
    stage === 'hand' ? '' : supported, coverContact,
    stage === 'hand' || relation.orientation === 'contextual' || relation.orientation === 'not_applicable' ? '' : `${object} in ${relation.orientation} orientation`,
    stage === 'hand' || relation.viewerSurface === 'contextual' ? '' : relation.viewerSurface === 'back' ? `${object} back casing facing the viewer` : `${object} ${relation.viewerSurface} visible`,
  ].filter(Boolean).join(', ');
}

// Only known semantic rewrites are allowed. Unknown negation is surfaced, never
// mechanically deleted (e.g. a hand approaching is not a gripping hand).
export function compilePromptFields(fields = [], negative = '') {
  const accepted = [], negatives = promptTerms(negative), audit = [], errors = [], seen = new Set();
  for (const field of fields) {
    const appliedTerms=[];
    let text = clean(field.text);
    if (!text) continue;
    const original = text;
    const move = (pattern, exclusion) => { text = text.replace(pattern, () => { negatives.push(exclusion); return ''; }); };
    move(/\b(?:no|without|avoid|never|not)\s+(?:forced\s+)?(?:eye contact with (?:the )?(?:viewer|camera)|(?:looking|gazing)\s+(?:directly\s+)?(?:at|towards?)\s+(?:the )?(?:viewer|camera))/gi, 'looking at viewer, eye contact with camera');
    move(/\bdo not rotate the face toward the viewer\b/gi, 'front-facing portrait gaze');
    move(/\b(?:do not show|no(?: visible)?)\s+(?:waist or legs|legs or (?:the )?full bod(?:y|ies)|legs|full bod(?:y|ies))(?: visible)?\b/gi, 'full-body composition');
    move(/\bno (?:split screen|legible text|visible bag|glasses|visible outerwear change)\b/gi, '');
    move(/\bno (?:text|speech bubbles|captions)\b/gi, 'text, speech bubbles, captions');
    move(/\bno rain\b/gi, 'rain');
    text = text.replace(/\bnot (smiling|crying|happy|sad|angry|worried)\b/gi, (_,state)=>{negatives.push(state);return '';});
    // Absence of an accessory is represented by its scoped negative, not global.
    if (/\bno visible bag\b/i.test(original)) negatives.push('bag');
    if (/\bno glasses\b/i.test(original)) negatives.push('glasses');
    if (/\bno outerwear\b/i.test(original)) negatives.push('outerwear');
    text=text.replace(/\bno outerwear\b/gi,'');
    if (/\bno split screen\b/i.test(original)) negatives.push('split screen');
    if (/\bno legible text\b/i.test(original)) negatives.push('legible text');
    text = text
      .replace(/\bwithout assuming reading\b/gi, 'in the carrying or reaching position')
      .replace(/\b(?:hands? approaching|hand approaching the (?:declared )?object) without contact\b/gi, 'hand approaching the object with a visible gap')
      .replace(/\bwithout (?:touching each other|contact)\b/gi, 'with a visible gap')
      .replace(/\b(?:handle not yet contacted)\b/gi, 'visible gap between hand and handle')
      .replace(/\bnot raised for reading or operating\b/gi, 'held in the carrying position')
      .replace(/\bwithout flattening (?:the )?(?:perspective|character-facing angle)\b/gi, 'at the character-facing angle')
      .replace(/\brather than posing for a portrait\b/gi, '')
      .replace(/\bavoid tight portrait framing\b/gi, '')
      .replace(/\bdo not press downward onto a lap or foreground surface\b/gi, 'stay at the action height')
      .replace(/\bdo not introduce a new grip\b/gi, 'remain separated from the object')
      .replace(/\b(?:masterpiece|best quality|clearly readable facial expression|readable story-appropriate expression|same established facial identity|consistent established facial identity|defined facial features|clean consistent natural skin)\b/gi, '')
      .replace(/\b(?:clearly readable|readable)\s+(?=(?:joyful|surprised|worried|sad|angry) expression)/gi, '')
      .replace(/\b(?:preserve|respect)\s+(?:the )?(?:declared )?(?:object surface and exclusion regions|surface plane and normal|exclusion regions)[^;]*$/gi, '')
      .replace(/\bpreserve (?:a )?visible (?:gap|separation)\b/gi, 'visible separation')
      .replace(/\bpreserve (?:gaze toward|the independently declared gaze)\b/gi, 'gaze toward')
      .replace(/\b(?:the )?declared\s+/gi, '')
      .replace(/\baction stage (?:anticipation|contact|follow_through)\b/gi, '')
      .replace(/\bno (?:legs|waist|feet) (?:are )?visible\b/gi, '')
      .replace(/\b(?:not_applicable|unknown)\b/g, '')
      .replace(/\s*,\s*,/g, ',').replace(/\(\s*:\d+(?:\.\d+)?\)/g, '');
    text = text.replace(/,\s*(?=:\d)/g, '').replace(/\(\s*,/g, '(');
    for (const term of promptTerms(text)) {
      if (!/[a-z]/i.test(term)) continue;
      if (/^(?:not visible indoors|calm weather|hands naturally positioned for the described action and framing|acting hands visible and following the described action|contextual orientation determined by the current action|visible surface follows camera and action geometry|object position consistent with its support and transfer stage|action in progress|ambient illumination consistent with the declared scene lighting|motivated directional key light|soft environment bounce light|natural gaze follows the surrounding story action)$/i.test(term)) {
        audit.push({factId:field.id,source:field.source,requested:term,applied:'',reason:'non_visual_placeholder'});continue;
      }
      if (/\b(?:no|not|never|without|avoid|do not)\b/i.test(term)) {
        errors.push(`${field.id}: unsupported negative instruction: ${term}`); continue;
      }
      if (/[{}]|\b(?:character_[\w-]+|prop_character_[\w-]+|normalized|exclusion regions)\b/.test(term)) {
        errors.push(`${field.id}: internal protocol in visual text: ${term}`); continue;
      }
      const fingerprint = key(term);
      if (seen.has(fingerprint)) { audit.push({ factId: field.id, source: field.source, requested: term, applied: '', reason: 'duplicate' }); continue; }
      seen.add(fingerprint); accepted.push(term);appliedTerms.push(term);
    }
    const applied=appliedTerms.join(', ');
    audit.push({ factId: field.id, source: field.source, requested: original, applied, reason: original === applied ? 'retained' : 'semantic_rewrite' });
  }
  return { prompt: accepted.join(', '), negativePrompt: uniquePrompt(negatives.filter(Boolean).join(', ')), audit, errors, statistics: { characters: accepted.join(', ').length, terms: accepted.length } };
}

export function createPromptPlan({ common, characters, relations = [], negativeBlocks = {}, style = ART_STYLE }) {
  const shared = compilePromptFields(common);
  const people = characters.map(person => ({ ...person, compiled: compilePromptFields(person.fields, person.negative || '') }));
  const commonNegatives = people.length === 1 ? people[0].compiled.negativePrompt : promptTerms(people[0]?.compiled.negativePrompt).filter(term => people.every(p => promptTerms(p.compiled.negativePrompt).includes(term))).join(', ');
  const negative = uniquePrompt([...Object.values(negativeBlocks), shared.negativePrompt, commonNegatives].filter(Boolean).join(', '));
  const snapshot = { common, characters: people.map(({compiled, ...person}) => ({...person, negative:compiled.negativePrompt})), relations, style, negativeBlocks };
  const relationErrors=relations.filter(r=>!Number.isInteger(r.expectedCount??1)||(r.expectedCount??1)<1||(r.expectedCount??1)>16).map(r=>`${r.relationId}: prop count must be an integer from 1 to 16`);
  return { version: PROMPT_COMPILER_VERSION, factsHash: hash(snapshot), facts: snapshot, commonPrompt: shared.prompt, characterPrompts: people.map(p => p.compiled.prompt), negativePrompt: negative, characterNegatives: people.map(p => ({ characterId: p.characterId, prompt: p.compiled.negativePrompt })), audit: [...shared.audit, ...people.flatMap(p => p.compiled.audit)], errors: [...shared.errors, ...people.flatMap(p => p.compiled.errors),...relationErrors] };
}

/** Recompile owned relation fields after Pose changes; never append a second state. */
export function rebindPromptPlanRelations(plan, relations) {
  const characters=plan.facts.characters.map(person=>{
    const owned=relations.filter(r=>r.characterId===person.characterId&&r.required);
    const changed=owned.filter(r=>{
      const old=plan.facts.relations.find(p=>p.relationId===r.relationId&&p.characterId===r.characterId);
      return old && (JSON.stringify(relationActionState(old))!==JSON.stringify(relationActionState(r)) || old.handMode!==r.handMode || old.activeHand!==r.activeHand);
    });
    const fields=person.fields.filter(f=>f.group!=='interaction').map(f=>{
      if(f.group==='action'&&changed.some(r=>r.actionPlan))return {...f,text:'',source:'effective_interaction_replaced_old_action'};
      if(f.group==='hands'&&changed.length){
        const text=promptTerms(f.text).filter(t=>!changed.some(r=>t.toLowerCase().includes(r.object.toLowerCase())&&/hand|grip|hold|contact|touch/i.test(t))).join(', ');
        return {...f,text,source:'effective_interaction_reconciled_hands'};
      }
      return f;
    });
    const insertion=fields.findIndex(f=>f.group==='expression');
    fields.splice(insertion<0?fields.length:insertion,0,...owned.map(r=>({id:`${person.characterId}.interaction.${r.relationId}`,group:'interaction',text:relationVisualText(r),source:'effective_interaction_contract'})));
    return {...person,fields};
  });
  return createPromptPlan({...plan.facts,characters,relations});
}

/** Bounded checks for edits to owned attributes; new visual details remain free. */
export function validatePromptEditorial(plan, { common = '', characters = [], global = '' } = {}) {
  const errors = [], count = plan.facts.characters.length;
  const positiveEdit = text => compilePromptFields([{id:'editorial',text,source:'manual'}]).prompt;
  common=positiveEdit(common);global=positiveEdit(global);characters=characters.map(positiveEdit);
  for (const text of [common,global]) {
    for (const match of text.matchAll(/\bexactly\s+(one|two|three|\d+)\s+(?:\w+\s+){0,4}(?:people|persons?|women|men|girls?|boys?)\b/gi)) {
      const expected = {one:1,two:2,three:3}[match[1].toLowerCase()] || Number(match[1]);
      if(expected!==count)errors.push(`count: editorial requests ${expected} people but ${count} characters are bound`);
    }
    if(count!==1 && /\bsolo\b/.test(text))errors.push('count: solo conflicts with the bound cast');
  }
  const attrs = [
    ['hair_color',/\b(black|brown|pink|red|blue|green|white|silver|purple|blonde?|gr[ae]y)\s+hair\b/gi],
    ['eye_color',/\b(black|brown|pink|red|blue|green|white|silver|purple|hazel|amber|gr[ae]y)\s+eyes\b/gi],
    ['hair_length',/\b(short|long|waist-length|shoulder-length)\s+(?:layered\s+|straight\s+|curly\s+)?hair\b/gi],
  ];
  const normalized = value => value==='waist-length'?'long':value.replace('grey','gray').replace(/^blond$/,'blonde');
  plan.facts.characters.forEach((person,index)=>{
    for(const relation of plan.facts.relations.filter(r=>r.characterId===person.characterId&&r.required)) {
      for(const text of [characters[index] || '',global]) {
        const count=explicitPropCount(relation.object,text);
        if(count!==null&&count!==(relation.expectedCount||1))errors.push(`${person.characterId}.prop_count: editorial conflicts with ${relation.expectedCount||1} ${relation.object}`);
        const state=relationActionState(relation);
        for(const term of promptTerms(text).filter(t=>t.toLowerCase().includes(relation.object.toLowerCase()))) {
          if(state?.contactState==='approach' && /\b(?:holding|gripping|contacting|touching)\b/i.test(term))errors.push(`${person.characterId}.contact: editorial contact conflicts with approach phase`);
          if(state?.contactState==='contact' && /\bapproaching\b|visible gap/i.test(term))errors.push(`${person.characterId}.contact: editorial gap conflicts with contact phase`);
        }
      }
    }
    const identity=person.fields.filter(f=>f.group==='identity').map(f=>f.text).join(', ');
    for(const [attribute,pattern] of attrs) {
      const effective=[...identity.matchAll(pattern)].map(m=>normalized(m[1].toLowerCase()));
      for(const value of [characters[index] || '',global])for(const m of value.matchAll(pattern)) {
        if(effective.length && !effective.includes(normalized(m[1].toLowerCase())))errors.push(`${person.characterId}.${attribute}: editorial conflicts with the effective character attribute`);
      }
    }
    const gaze=person.fields.filter(f=>f.group==='gaze').map(f=>f.text).join(', ');
    const cameraGaze=/\b(?:looking|gazing)\s+(?:directly\s+)?(?:at|towards?)\s+(?:the )?(?:camera|viewer)|eye contact with (?:the )?(?:camera|viewer)/i;
    if(!cameraGaze.test(gaze) && cameraGaze.test(`${characters[index] || ''},${global}`))errors.push(`${person.characterId}.gaze: edit the character gaze field before requesting camera gaze`);
    const clothing=person.fields.filter(f=>f.group==='clothing').map(f=>f.text).join(', ');
    const categories=/\b(?:shirt|blouse|dress|skirt|coat|jacket|suit|pants|trousers|shorts|sweater|cardigan|vest|tunic|robe)\b/gi;
    const current=[...clothing.matchAll(categories)].map(m=>m[0].toLowerCase());
    for(const value of [characters[index] || '',global])for(const match of value.matchAll(/\b(?:wearing|dressed in)\s+([^;,.]+)/gi)) {
      const proposed=[...match[1].matchAll(categories)].map(m=>m[0].toLowerCase());
      if(current.length && proposed.some(category=>!current.includes(category)))errors.push(`${person.characterId}.clothing: select the garment asset before changing garment category`);
    }
  });
  return errors;
}

export function compileStagePrompt(plan, { stage, characterId, relationId, details = '', negative = '' } = {}) {
  if (plan?.version !== PROMPT_COMPILER_VERSION) throw new Error('Unsupported prompt compiler version');
  const person = plan.facts.characters.find(p => p.characterId === characterId);
  const relation = relationId ? plan.facts.relations.find(r => r.relationId === relationId) : null;
  if (!person) throw new Error(`Missing prompt facts for character ${characterId}`);
  if (relationId && (!relation || relation.characterId !== characterId)) throw new Error('Prompt relation does not belong to character');
  const allowed = {
    identity: ['identity', 'expression', 'gaze', 'occlusion'],
    outfit: ['clothing', 'condition'],
    prop: ['action', 'hands', 'expression'],
    hand: ['action', 'hands'],
    gaze: ['identity', 'expression', 'gaze', 'occlusion'],
    handoff: ['action', 'hands', 'gaze'],
  }[stage];
  if (!allowed) throw new Error(`Unknown prompt stage ${stage}`);
  const fields = person.fields.filter(f => allowed.includes(f.group) && !(relation && ['action','hands'].includes(f.group)) && !(stage === 'hand' && f.group === 'action'));
  // A garment pass has an explicit garment zone; never request the other garments.
  const selected = fields.filter(f => !(stage === 'outfit' && details && f.group === 'clothing') && !(stage === 'gaze' && details && f.group === 'gaze'));
  const relationText = relation && stage !== 'gaze' ? relationVisualText(relation,stage) : '';
  const scene = plan.facts.common.filter(f => ['lighting', 'style'].includes(f.group));
  const exclusions = { identity: 'blurry face, malformed eyes, wrong identity', outfit: 'wrong garment category, wrong garment color, missing clothing layer', prop: 'duplicated prop, unrelated object, malformed hands', hand: 'extra hand, fused fingers, broken wrist, detached hand', gaze: 'crossed eyes, mismatched pupils', handoff: 'fused hands, disconnected umbrella handle' }[stage];
  const personExclusions = promptTerms(person.negative).filter(term => ['identity','gaze'].includes(stage)
    ? !/garment|clothing|coat|skirt|dress|bag|shoe|full body|legs/i.test(term)
    : stage === 'outfit' ? !/eye contact|looking at|gaze|pupils/i.test(term) : false).join(', ');
  const localNegative = [personExclusions, relation?.negative?.join(', '), relation?.expectedCount>1 ? exclusions.replace('duplicated prop','incorrect prop count') : exclusions, negative].filter(Boolean).join(', ');
  return compilePromptFields([...selected, { id: `${stage}.relation`, group: 'relation', text: relationText, source: 'interaction_contract' }, { id: `${stage}.details`, group: 'details', text: details, source: 'stage_context' }, ...scene], localNegative);
}

export function finalizePromptPlan(plan, { commonPrompt, characterPrompts, prompt, negativePrompt, editorial = '' }) {
  const shared = compilePromptFields([{ id: 'common.execution', text: commonPrompt, source: 'canonical' }]);
  const people = characterPrompts.map((text, index) => compilePromptFields([{ id: `character.${index}.execution`, text, source: 'canonical_pose' }]));
  const edit = compilePromptFields([{ id: 'editorial', text: editorial, source: 'manual_edit' }]);
  const errors = [...plan.errors, ...shared.errors, ...people.flatMap(p => p.errors), ...edit.errors];
  const personNegatives = people.map(p => promptTerms(p.negativePrompt));
  const commonPersonNegative = personNegatives[0]?.filter(t => personNegatives.every(n => n.includes(t))).join(', ') || '';
  const effectiveNegative = uniquePrompt([negativePrompt, shared.negativePrompt, commonPersonNegative, edit.negativePrompt].filter(Boolean).join(', '));
  const facts = {...plan.facts, characters:plan.facts.characters.map((person,index)=>({...person,negative:uniquePrompt([person.negative,people[index]?.negativePrompt].filter(Boolean).join(', '))}))};
  const factsHash = hash(facts);
  return { ...plan, facts, factsHash, characterNegatives:facts.characters.map(p=>({characterId:p.characterId,prompt:p.negative})), commonPrompt: shared.prompt, characterPrompts: people.map(p => p.prompt), appliedPrompt: prompt, negativePrompt: effectiveNegative, executionHash: hash({ prompt, negativePrompt: effectiveNegative, factsHash }), errors, audit: [...plan.audit, ...shared.audit, ...people.flatMap(p => p.audit), ...edit.audit] };
}

export function assertPromptPlanRecipe(recipe) {
  const plan = recipe.generationSpec?.promptPlan;
  if (!plan) {
    const version=recipe.generationSpec?.compilerVersion;
    if(version && !['sd15-visual-spec-v1','sd15-staged-identity-v2'].includes(version))throw new Error('Missing or unsupported prompt compiler plan');
    return;
  }
  if (plan.version !== PROMPT_COMPILER_VERSION) throw new Error('Unsupported prompt compiler version');
  if (plan.errors.length) throw new Error(plan.errors.join('; '));
  if (plan.factsHash !== hash(plan.facts) || plan.executionHash !== hash({prompt:plan.appliedPrompt,negativePrompt:plan.negativePrompt,factsHash:plan.factsHash})) throw new Error('Prompt plan fingerprint mismatch');
  if (recipe.prompt !== plan.appliedPrompt || recipe.negativePrompt !== plan.negativePrompt) throw new Error('Recipe prompt differs from compiled plan');
}

/** Pure request adapter: all new image requests pass here before transport. */
export function prepareGenerationPromptRequest(recipe, payload, context) {
  assertPromptPlanRecipe(recipe);
  const plan = recipe.generationSpec?.promptPlan;
  if (!plan) return payload; // immutable legacy recipe compatibility
  let compiled;
  if (context.stage === 'base') {
    const blocks = payload.prompt.split(/\s+BREAK\s+/).map((text,i)=>compilePromptFields([{id:`base.${i}`,text,source:'compiled_base_execution'}]));
    const errors = blocks.flatMap(p=>p.errors);
    if(errors.length)throw new Error(errors.join('; '));
    compiled = { prompt:blocks.map(p=>p.prompt).join(' BREAK '),negativePrompt:uniquePrompt([payload.negative_prompt,plan.negativePrompt,...blocks.map(p=>p.negativePrompt)].join(', ')),audit:blocks.flatMap(p=>p.audit) };
  } else {
    // Execution projection may change coordinates, never the contract semantics.
    const executable = recipe.generationSpec.repairPasses?.propInteractions || [];
    const stagedPlan = { ...plan, facts: { ...plan.facts, relations: plan.facts.relations.map(r => executable.find(e => e.relationId === r.relationId && e.characterId === r.characterId) || r) } };
    compiled = compileStagePrompt(stagedPlan, context);
    if (compiled.errors.length) throw new Error(compiled.errors.join('; '));
  }
  const result = { ...payload, prompt: compiled.prompt, negative_prompt: compiled.negativePrompt };
  const trace = {stage:context.stage,characterId:context.characterId || null,relationId:context.relationId || null,version:plan.version,factsHash:plan.factsHash,prompt:result.prompt,negativePrompt:result.negative_prompt,textHash:hash([result.prompt,result.negative_prompt]),audit:compiled.audit,requestStatus:'prepared',controlBindings:(result.alwayson_scripts?.ControlNet?.args || []).map(unit=>({module:unit.module,model:unit.model,weight:unit.weight,guidanceStart:unit.guidance_start,guidanceEnd:unit.guidance_end,regionMaskApplied:Boolean(unit.effective_region_mask)})),maskApplied:Boolean(result.mask)};
  recipe.promptRequestTraces = [...(recipe.promptRequestTraces || []), trace];
  if (context.stage === 'base' && recipe.requestTrace) { recipe.requestTrace.prompt = result.prompt; recipe.requestTrace.negativePrompt = result.negative_prompt; }
  return result;
}
