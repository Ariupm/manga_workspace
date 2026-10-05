import {actionIntent,positiveActionText} from './pose-action-semantics';
import {extraTemplateFromText} from './pose-v3/action-catalog';
import {resolveActionMechanism,mechanismPromptTerms} from '../scripts/action-mechanism.mjs';
import type {ActionGeometryInput} from './pose-v3/action-relations';
import type {PosePhase} from './pose-v2';
import {actionStageState,actionStageVerb,actionStageObjectTerms} from '../scripts/action-stage-policy.mjs';

export type StoryActionContract={version:'story-action-1';actionId:string;phase:PosePhase;geometry:ActionGeometryInput;source:'story'|'confirmed_interaction';evidence:string;assumptions:string[]};
export function storyActionPhase(text:string):PosePhase{
 if(/anticipation|prepar|about to|before|准备|将要|尚未|接近/i.test(text))return 'anticipation';
 if(/follow.?through|finished|completed|after|released|\bpicked up\b|已经|完成|松开|放好|关好|打开后|拿到|取到/i.test(text))return 'follow_through';
 return 'contact';
}
/** Enrich the existing prop contract; do not re-generate identity, clothing or camera decisions. */
export function inferStoryActionContract(input:{object:string;expectedCount?:number;purpose:string;objectCenter:{x:number;y:number};region:{xStart:number;xEnd:number}},action:string,phaseText='',confirmed=false,forcedActionId?:string):StoryActionContract|null{
 const positive=positiveActionText(action);
 const intent=forcedActionId||actionIntent(positive)||extraTemplateFromText(positive)||(input.purpose==='operate'&&/using|hammering|tighten|screwing|painting|用|敲|拧紧|绘画/i.test(positive)?'tool':null);
 const id=intent==='reach'?'pick':intent;
 if(!id||!['open','close','operate_environment','write','tool','push','pull','pick','place'].includes(id))return null;
 const explicitPhase=/anticipation|prepar|before|about to|follow.?through|finished|completed|after|released|\bcontact\b|准备|尚未|接近|完成|松开|接触|抓住/i.test(phaseText);
 const finishingTouch=id==='pick' && /\b(?:and|then)\s+(?:gently\s+)?(?:touch(?:ing)?|strok(?:e|ing)|inspect(?:ing)?)\b/i.test(action);
 const phase=explicitPhase?storyActionPhase(phaseText):intent==='reach'?'anticipation':finishingTouch?'follow_through':storyActionPhase(action+' '+phaseText),object=input.object.toLowerCase();
 const dir=/toward(?:s)? (?:the )?left|to (?:the )?left|向左|左侧/i.test(action)?-1:1;
 const geometry:ActionGeometryInput={actionId:id,phase,objectCount:input.expectedCount||1,source:confirmed?'confirmed_interaction':'story',assumptions:['representative parametric staging, not measured object dimensions',...(finishingTouch&&!explicitPhase?['final visible action clause follows retrieval']:[])],baseCenter:{...input.objectCenter},axis:{x:dir,y:0}};
 if(['open','close'].includes(id)){
  if(/drawer|sliding|slide|抽屉|推拉门|滑动/.test(object+' '+action))Object.assign(geometry,{mechanism:'slide',controlShape:'panel',travel:.055,extent:{width:.12,height:.09}});
  else if(/door|window|hinged|门|窗|铰链/.test(object+' '+action))Object.assign(geometry,{mechanism:'hinge',controlShape:'panel',angle:1,hingeSide:/right.?hinge|hinge.*right|右.*铰链/i.test(action)?'right':'left',extent:{width:.13,height:.20}});
  else return {version:'story-action-1',actionId:id,phase,geometry,source:confirmed?'confirmed_interaction':'story',evidence:action,assumptions:['object opening mechanism is ambiguous']};
  geometry.stateBefore=id==='open'?'closed':'open';geometry.stateAfter=id==='open'?'open':'closed';
 }else if(id==='operate_environment'){
  if(/knob|dial|handle|旋钮|旋转|转动把手/.test(object+' '+action))Object.assign(geometry,{mechanism:'rotate',controlShape:'knob',angle:/counter.?clockwise|逆时针/i.test(action)?-Math.PI/2:Math.PI/2,extent:{width:.065,height:.065},stateBefore:'initial_rotation',stateAfter:'turned'});
  else if(/button|switch|按钮|开关/.test(object))Object.assign(geometry,{mechanism:'press',controlShape:'button',axis:{x:0,y:1},travel:.008,extent:{width:.035,height:.035},stateBefore:'released',stateAfter:'pressed'});
 }else if(['write','tool'].includes(id)){
  const shape=/scissors|剪刀/.test(object)?'scissors':/knife|blade|刀/.test(object)?'knife':/keyboard|键盘/.test(object)?'keyboard':/hammer|锤|榔头/.test(object)?'hammer':/wrench|扳手/.test(object)?'wrench':/screwdriver|螺丝刀/.test(object)?'screwdriver':/pliers|钳子/.test(object)?'pliers':/pencil|铅笔/.test(object)?'pencil':/brush|画笔|毛笔/.test(object)?'brush':/pen|笔/.test(object)?'pen':null;
  if(shape)Object.assign(geometry,{mechanism:'work',controlShape:shape,axis:{x:dir*.7,y:.7},workPoint:{x:input.objectCenter.x+dir*.035,y:input.objectCenter.y+.035},extent:shape==='keyboard'?{width:.13,height:.06}:{width:.10,height:.10},stateBefore:'tool_approaching_work_surface',stateAfter:'tool_at_work_surface'});
 }else if(['push','pull'].includes(id)){
  Object.assign(geometry,{mechanism:'force',controlShape:'box',extent:{width:.13,height:.12},supportY:input.objectCenter.y+.06,stateBefore:'object_at_start',stateAfter:'object_under_'+id+'_force'});
  if(/(?:on|across|along|over) (?:the )?(?:floor|ground)|在地(?:上|面)|沿.*地面|地面上/i.test(action))Object.assign(geometry,{baseCenter:{x:input.objectCenter.x,y:.78},supportY:.90,extent:{width:.16,height:.24},assumptions:[...geometry.assumptions!,'floor-supported representative box dimensions']});
 }else{
  Object.assign(geometry,{mechanism:'transfer',controlShape:'box',supportY:input.objectCenter.y,extent:{width:.10,height:.08},stateBefore:id==='pick'?'on_support':'held',stateAfter:id==='pick'?'held':'on_support'});
  // Only unbound inferred targets may be staged. Confirmed relations retain
  // their authored anchors; every consumer receives the same resolved target.
  if(!confirmed&&id==='pick'&&/shelf|rack|货架|架子/.test(action)){
   const side=/right|右/.test(action)?1:-1;
   const center={x:input.objectCenter.x+side*(input.region.xEnd-input.region.xStart)*.14,y:.42};
   Object.assign(geometry,{baseCenter:center,supportY:center.y,assumptions:[...geometry.assumptions!,'unbound shelf target staged beside actor at upper-body height']});
  }
 }
 if(geometry.controlShape)geometry.modelVersion='action-mechanism-1';
 if((input.expectedCount||1)>1)geometry.assumptions=[...geometry.assumptions!,'representative side-by-side item layout within one group footprint'];
 const resolved=resolveActionMechanism(geometry,phase);
 return{version:'story-action-1',actionId:id,phase,geometry:resolved,source:confirmed?'confirmed_interaction':'story',evidence:action,assumptions:geometry.assumptions||[]};
}
export function storyActionTerms(plan:StoryActionContract){
 const g=plan.geometry;
 const state=actionStageState(plan.actionId,plan.phase);
 const action=actionStageVerb(plan.actionId,plan.phase);
 const mechanism=g.mechanism==='hinge'?'panel rotating about its vertical hinge':g.mechanism==='slide'?'object sliding along its track':g.mechanism==='rotate'?'turning the declared knob around its axis':g.mechanism==='press'?'pressing the fixed button':g.mechanism==='work'?'working tip contacting the declared work surface':g.mechanism==='force'?'hand contact and planted feet aligned with the force direction':'object and support consistent with the action stage';
 return [action,...actionStageObjectTerms(plan.actionId,plan.phase),...(g.modelVersion==='action-mechanism-1'?mechanismPromptTerms(g):[mechanism]),state.contactState==='approach'?'hand approaching without contact':state.contactState==='released'?'object on support, hands released with visible separation':'acting hand at the declared contact',`action stage ${plan.phase}`];
}
