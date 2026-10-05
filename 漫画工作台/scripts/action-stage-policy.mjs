import {mechanismPromptTerms} from "./action-mechanism.mjs";
/** Shared state machine consumed by prompt compilation, geometry and local passes. */
export function actionStageState(actionId, phase='contact') {
 const contactState=phase==='anticipation'?'approach':phase==='follow_through'&&actionId==='place'?'released':'contact';
 return {actionId,phase,contactState,contactRequired:contactState==='contact',
  objectState:actionId==='pick'?(phase==='follow_through'?'held':'on_support'):actionId==='place'?(phase==='anticipation'?'held':'on_support'):'action_specific'};
}
export function relationActionState(relation) {
 const plan=relation?.actionPlan,audit=relation?.actionRelationAudit;
 if(audit)return {...actionStageState(plan?.actionId||audit.geometry?.actionId,audit.phase),contactState:audit.contactState,contactRequired:audit.contactState==='contact'};
 if(plan)return actionStageState(plan.actionId,plan.phase);
 const facts=relation?.visualFacts;
 return facts?{actionId:facts.actionId,phase:facts.phase,contactState:facts.contact.state,contactRequired:facts.contact.state==='contact',objectState:facts.support.state}:null;
}
export function actionStageVerb(actionId,phase='contact') {
 const verb={open:'opening',close:'closing',operate_environment:'operating',write:'writing with',tool:'using',push:'pushing',pull:'pulling',pick:'picking up',place:'placing'}[actionId]||actionId;
 if(phase==='anticipation')return actionId==='pick'?'reaching toward':'preparing for '+verb;
 if(phase==='follow_through'&&actionId==='pick')return 'holding after picking up';
 if(phase==='follow_through'&&actionId==='place')return 'having placed and released';
 return verb;
}
export function actionStageObjectTerms(actionId,phase='contact') {
 const state=actionStageState(actionId,phase);
 return state.objectState==='on_support'?['object remains on its declared support']:
  state.objectState==='held'?['object is held clear of its previous support']:[];
}
export function actionContactTerms(relation){
 const g=relation?.actionRelationAudit?.geometry||relation?.actionPlan?.geometry;
 if(g?.modelVersion!=='action-mechanism-1')return [`the hand visibly wraps around its own edge of the established ${relation.object}`];
 const contact=g.mechanism==='press'?'acting fingertip pressing the declared control face':g.mechanism==='rotate'?'fingers turning the declared knob around its fixed pivot':g.mechanism==='force'?'palm applying force at the declared contact point':g.mechanism==='work'?'fingers grasping the tool handle while its working end meets the declared work surface':'fingers contacting the declared handle or object edge';
 return [contact,...mechanismPromptTerms(g)];
}
export function contactPassAllowed(relation){return relationActionState(relation)?.contactRequired??true;}
export function phaseInteractionTerms(relation){
 const terms=relation?.positive||[];
 if(contactPassAllowed(relation))return terms;
 const state=relationActionState(relation).contactState;
 return [...terms.filter(t=>!/(?:hand|wrist|grip|holding|contact)/i.test(t)),state==='released'?'hands released from the supported object; preserve separation':'hand approaching the object without contact; preserve a visible gap'];
}

export function synchronizedActionTerms(relation){
 const g=relation?.actionRelationAudit?.geometry||relation?.actionPlan?.geometry;
 if(g?.modelVersion!=='action-mechanism-1')return phaseInteractionTerms(relation);
 const terms=(relation.positive||[]).filter(t=>! /^(?:object remains on its declared support|object is held clear of its previous support|reaching toward|preparing for|holding after picking up|having placed and released|opening|closing|operating|writing with|using|pushing|pulling|picking up|placing|action stage |before contact|completed action|action in progress|hand approaching|acting hand at|object on support)/i.test(t)&&! /^(?:panel opening|panel sliding|panel at|button remains|knob remains|object at rest|acting fingertip|hand turning|tool working|hand force|object position consistent)/i.test(t));
 return phaseInteractionTerms({...relation,positive:[...terms,`${actionStageVerb(g.actionId,g.phase||relation.actionPlan?.phase)} the declared ${relation.object}`,...actionStageObjectTerms(g.actionId,g.phase||relation.actionPlan?.phase),...mechanismPromptTerms(g)]});
}
