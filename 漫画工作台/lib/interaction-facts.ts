import type {InteractionVisualFacts} from './types';
import {actionStageState} from '../scripts/action-stage-policy.mjs';

const groups = ['object','phase','contact','support','gaze','workTarget'] as const;
export const interactionFactsShape = {version:'interaction-facts-1',object:{label:'',instanceId:'',count:1},actionId:'hold',phase:'contact',contact:{hand:'right',part:'',state:'contact'},support:{label:'',state:'unspecified'},gaze:{kind:'object',targetId:'',surface:'',description:''},workTarget:null,provenance:{}};
export const interactionFactsInstruction = `For every prop interaction include visualFacts with version "interaction-facts-1", object {label: concrete English noun, instanceId: stable group or instance ID, count: integer 1..16}, actionId (pick, place, open, close, operate_environment, write, tool, push, pull, hold, inspect, drink, carry, touch, read), phase (anticipation, contact, follow_through), contact {hand: left/right/both, part: concrete object part, state: approach/contact/released}, support {label: concrete support noun or empty, state: on_support/held/unspecified}, gaze {kind: object/character/independent, targetId: a declared visible object.instanceId for object or visible character ID for character, surface: cover/page/screen/etc or empty, description: visible gaze direction}, provenance with object/phase/contact/support/gaze each {source: narrative/model, evidence: source phrase}. For tool/write interactions with another visible work object, include workTarget {instanceId: the declared target object ID, surface: concrete surface, operation: cutting/painting/writing/tightening/etc, u: normalized surface x 0..1, v: normalized surface y 0..1}. The work target is independent of gaze. The assisting hand stabilizes that object (touch), not a second later action. object may include form solid_box/flat/tool and representative source-space width/height (0.01..0.4) with provenance. Preserve explicit quantities and final visible action; never replace plural groups with count 1. If quantity is not given, mark your choice model, not narrative. Do not merge heterogeneous objects or separately owned same-type objects into one instance; shared props use the same instanceId and count. Contact describes the hand touching the object, separately from the object touching a support or work target. Preparing to pick means approach; preparing to place an already held object means contact with support.state held. For tool/write preparation, an already held tool retains hand contact while its working end approaches the work target; a tool still on its support has hand approach. Contact phase means contact; completed place means released on support; completed pick means held. Structured fields govern execution, and descriptive action/contactPoints/gazeTarget must agree. Portable tools such as scissors, knives, hammers and screwdrivers use actionId tool when cutting, hammering or tightening; operate_environment is for fixed environmental controls. Preserve the specific operation and work target in action. Do not use vague "in progress" as the structured phase.`;
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
  if(['anticipation','contact'].includes(raw.phase)&&raw.contact.state!==actionStageState(raw.actionId,raw.phase,raw.support?.state).contactState)throw new Error('交互事实阶段与接触状态冲突');
  if (!string(raw.contact?.part)) throw new Error('交互事实缺少接触部位');
  member(raw.support?.state,['on_support','held','unspecified'],'support.state');
  if (raw.support.state === 'on_support' && !string(raw.support?.label)) throw new Error('交互事实缺少支持物');
  member(raw.gaze?.kind,['object','character','independent'],'gaze.kind');
  if (raw.gaze.kind !== 'independent' && !string(raw.gaze?.targetId)) throw new Error('交互事实缺少视线目标ID');
  if (!string(raw.gaze?.description)) throw new Error('交互事实缺少视线说明');
  if(raw.object.form)member(raw.object.form,['solid_box','flat','tool'],'object.form');
  for(const key of ['width','height'])if(raw.object[key]!=null&&(!Number.isFinite(raw.object[key])||raw.object[key]<.01||raw.object[key]>.4))throw new Error('物体尺寸必须为0.01至0.4的有限数值');
  let workTarget:InteractionVisualFacts['workTarget'];
  if(raw.workTarget){
    if(!['tool','write'].includes(raw.actionId)||!string(raw.workTarget.instanceId)||raw.workTarget.instanceId===raw.object.instanceId||!string(raw.workTarget.surface)||!string(raw.workTarget.operation))throw new Error('工具工作目标缺少有效对象、表面或操作');
    for(const k of ['u','v'])if(!Number.isFinite(raw.workTarget[k])||raw.workTarget[k]<0||raw.workTarget[k]>1)throw new Error('工作表面坐标必须为0至1');
    workTarget={instanceId:string(raw.workTarget.instanceId),surface:string(raw.workTarget.surface),operation:string(raw.workTarget.operation),u:raw.workTarget.u,v:raw.workTarget.v};
  }
  const provenance: InteractionVisualFacts['provenance'] = {};
  for (const key of groups) {
    const supplied = raw.provenance?.[key];
    if (supplied) member(supplied.source,['manual','narrative','model','legacy_default'],`provenance.${key}`);
    // A manual spec edit supplies these explicit fields. Generated source claims
    // remain model claims unless accompanied by inspectable narrative evidence.
    const source = origin === 'manual' ? 'manual' : origin === 'preserve' && supplied ? supplied.source : supplied?.source === 'narrative' && string(supplied.evidence) ? 'narrative' : 'model';
    provenance[key] = {source,evidence:string(supplied?.evidence)};
  }
  return {version:'interaction-facts-1',actionId:raw.actionId,object:{label:string(raw.object.label),instanceId:string(raw.object.instanceId),count:raw.object.count,...(raw.object.form?{form:raw.object.form}:{}),...(raw.object.width?{width:raw.object.width}:{}),...(raw.object.height?{height:raw.object.height}:{})},workTarget,phase:raw.phase,
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
  const invariant=(f:any)=>JSON.stringify([f.version,f.object?.instanceId,f.object?.count,f.actionId,f.phase,f.contact?.hand,f.contact?.state,f.support?.state,f.gaze?.kind,f.gaze?.targetId,f.workTarget?.instanceId,f.workTarget?.u,f.workTarget?.v,f.object?.form,f.object?.width,f.object?.height]);
  for(const relation of original.interactions||[]){
    if(!relation.visualFacts)continue;
    const replacement=(translated.interactions||[]).find((r:any)=>r.actorCharacterId===relation.actorCharacterId&&r.visualFacts?.object?.instanceId===relation.visualFacts.object.instanceId);
    if(!replacement||invariant(relation.visualFacts)!==invariant(replacement.visualFacts))throw new Error('规格翻译丢失或改变了结构化数量、动作、接触或视线绑定，未保存');
  }
}

/** Correct only a demonstrable portable-tool/environment category conflict. */
export function reconcileInteractionAction(raw: any, action: string, origin: 'manual'|'model'|'preserve'='preserve') {
  if (!raw || raw.actionId !== 'operate_environment') return raw;
  const tool = /\b(scissors|knife|hammer|wrench|screwdriver|pliers|brush)\b/i.test(raw.object?.label || '');
  const operation = /\b(cutting|cut|hammering|tightening|screwing|painting|using)\b/i.test(action);
  if (!tool || !operation) return raw;
  if (origin === 'manual' || raw.provenance?.phase?.source === 'manual') throw new Error('便携工具操作不能归类为环境设施操作，请使用tool动作');
  return {...raw,actionId:'tool',provenance:{...raw.provenance,phase:{source:'model',evidence:`Portable tool operation category reconciled from: ${action}; original category: operate_environment`}}};
}

export function inferExplicitWorkTarget(facts:InteractionVisualFacts, action:string, peers:InteractionVisualFacts[]):InteractionVisualFacts['workTarget'] {
 if(facts.workTarget)return facts.workTarget;
 if(!['tool','write'].includes(facts.actionId))return undefined;
 const operation=action.match(/\b(cutting|painting|writing|hammering|tightening|screwing)\b/i)?.[1]?.toLowerCase();
 if(!operation)return undefined;
 const matches=peers.filter(p=>p.object.instanceId!==facts.object.instanceId).filter(p=>{
  const noun=p.object.label.toLowerCase().split(/\s+/).at(-1)!;
  return new RegExp('\\b'+noun.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(action);
 });
 if(matches.length!==1)return undefined;
 const target=matches[0];
 return {instanceId:target.object.instanceId,surface:/\b(?:package|parcel|box|carton)\b/i.test(target.object.label)&&operation==='cutting'?'sealing tape':'working surface',operation,u:.5,v:.2};
}
