import type {InteractionVisualFacts} from './types';

const groups = ['object','phase','contact','support','gaze'] as const;
export const interactionFactsShape = {version:'interaction-facts-1',object:{label:'',instanceId:'',count:1},actionId:'hold',phase:'contact',contact:{hand:'right',part:'',state:'contact'},support:{label:'',state:'unspecified'},gaze:{kind:'object',targetId:'',surface:'',description:''},provenance:{}};
export const interactionFactsInstruction = `For every prop interaction include visualFacts with version "interaction-facts-1", object {label: concrete English noun, instanceId: stable group or instance ID, count: integer 1..16}, actionId (pick, place, open, close, operate_environment, write, tool, push, pull, hold, inspect, drink, carry, touch, read), phase (anticipation, contact, follow_through), contact {hand: left/right/both, part: concrete object part, state: approach/contact/released}, support {label: concrete support noun or empty, state: on_support/held/unspecified}, gaze {kind: object/character/independent, targetId: a declared visible object.instanceId for object or visible character ID for character, surface: cover/page/screen/etc or empty, description: visible gaze direction}, provenance with object/phase/contact/support/gaze each {source: narrative/model, evidence: source phrase}. Preserve explicit quantities and final visible action; never replace plural groups with count 1. If quantity is not given, mark your choice model, not narrative. Do not merge heterogeneous objects or separately owned same-type objects into one instance; shared props use the same instanceId and count. Anticipation means approach, contact means contact; completed place means released on support; completed pick means held. Structured fields govern execution, and descriptive action/contactPoints/gazeTarget must agree. Do not use vague "in progress" as the structured phase.`;
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const member = (value: unknown, choices: readonly string[], label: string) => {
  if (!choices.includes(String(value))) throw new Error(`交互事实 ${label} 无效：${String(value)}`);
  return value;
};

/** Missing legacy facts stay missing: never manufacture an explicit count or source. */
export function normalizeInteractionFacts(raw: any, origin: 'manual' | 'model' | 'preserve' = 'preserve'): InteractionVisualFacts | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw.version !== 'interaction-facts-1') throw new Error('交互事实版本无效');
  if (!Number.isInteger(raw.object?.count) || raw.object.count < 1 || raw.object.count > 16) throw new Error('交互事实数量必须为1至16的整数');
  if (!string(raw.object?.label) || !string(raw.object?.instanceId)) throw new Error('交互事实缺少具体对象或实例ID');
  if(/^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\bor\b/i.test(raw.object.label))throw new Error('具体对象名称不能包含数量或备选类别；数量使用count字段');
  member(raw.actionId,['pick','place','open','close','operate_environment','write','tool','push','pull','hold','inspect','drink','carry','touch','read'],'actionId');
  if(raw.object.count>1&&['open','close','operate_environment','write','tool','push','pull','drink'].includes(raw.actionId))throw new Error('该动作没有多物体组执行几何；请将不同操作物体声明为独立交互实例');
  member(raw.phase,['anticipation','contact','follow_through'],'phase');
  if(raw.phase==='anticipation'&&['hold','inspect','drink','carry','touch','read'].includes(raw.actionId))throw new Error('该动作的接近阶段尚无几何执行器；请明确使用取物、工具或其他受支持的动作类型');
  member(raw.contact?.hand,['left','right','both'],'contact.hand');
  member(raw.contact?.state,['approach','contact','released'],'contact.state');
  if(raw.phase==='anticipation'&&raw.contact.state!=='approach'||raw.phase==='contact'&&raw.contact.state!=='contact')throw new Error('交互事实阶段与接触状态冲突');
  if (!string(raw.contact?.part)) throw new Error('交互事实缺少接触部位');
  member(raw.support?.state,['on_support','held','unspecified'],'support.state');
  if (raw.support.state !== 'unspecified' && !string(raw.support?.label)) throw new Error('交互事实缺少支持物');
  member(raw.gaze?.kind,['object','character','independent'],'gaze.kind');
  if (raw.gaze.kind !== 'independent' && !string(raw.gaze?.targetId)) throw new Error('交互事实缺少视线目标ID');
  if (!string(raw.gaze?.description)) throw new Error('交互事实缺少视线说明');
  const provenance: InteractionVisualFacts['provenance'] = {};
  for (const key of groups) {
    const supplied = raw.provenance?.[key];
    if (supplied) member(supplied.source,['manual','narrative','model','legacy_default'],`provenance.${key}`);
    // A manual spec edit supplies these explicit fields. Generated source claims
    // remain model claims unless accompanied by inspectable narrative evidence.
    const source = origin === 'manual' ? 'manual' : origin === 'preserve' && supplied ? supplied.source : supplied?.source === 'narrative' && string(supplied.evidence) ? 'narrative' : 'model';
    provenance[key] = {source,evidence:string(supplied?.evidence)};
  }
  return {version:'interaction-facts-1',actionId:raw.actionId,object:{label:string(raw.object.label),instanceId:string(raw.object.instanceId),count:raw.object.count},phase:raw.phase,
    contact:{hand:raw.contact.hand,part:string(raw.contact.part),state:raw.contact.state},support:{label:string(raw.support.label),state:raw.support.state},
    gaze:{kind:raw.gaze.kind,targetId:string(raw.gaze.targetId),surface:string(raw.gaze.surface),description:string(raw.gaze.description)},provenance};
}

/** A full-spec save is not evidence that every unchanged fact was manually chosen. */
export function markManualInteractionFactEdits(raw: any, previous?: InteractionVisualFacts): InteractionVisualFacts | undefined {
  const facts=normalizeInteractionFacts(raw);
  if(!facts)return undefined;
  if(!previous)return normalizeInteractionFacts(raw,'manual');
  const provenance={...facts.provenance};
  for(const key of groups){
    const changed=JSON.stringify(facts[key])!==JSON.stringify(previous[key]) || key==='phase'&&facts.actionId!==previous.actionId;
    provenance[key]=changed?{source:'manual',evidence:'visual specification field edit'}:previous.provenance[key]||{source:'model',evidence:''};
  }
  return {...facts,provenance};
}

/** Translation may change prose, never silently downgrade or alter execution facts. */
export function assertInteractionFactTranslation(original: any, translated: any): void {
  const invariant=(f:any)=>JSON.stringify([f.version,f.object?.instanceId,f.object?.count,f.actionId,f.phase,f.contact?.hand,f.contact?.state,f.support?.state,f.gaze?.kind,f.gaze?.targetId]);
  for(const relation of original.interactions||[]){
    if(!relation.visualFacts)continue;
    const replacement=(translated.interactions||[]).find((r:any)=>r.actorCharacterId===relation.actorCharacterId&&r.visualFacts?.object?.instanceId===relation.visualFacts.object.instanceId);
    if(!replacement||invariant(relation.visualFacts)!==invariant(replacement.visualFacts))throw new Error('规格翻译丢失或改变了结构化数量、动作、接触或视线绑定，未保存');
  }
}
