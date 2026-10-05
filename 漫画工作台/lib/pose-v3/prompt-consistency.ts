import {mechanismPromptTerms} from "../../scripts/action-mechanism.mjs";
import {extraActionsV3} from "./action-catalog";
import {basicTemplateFromText,positivePoseText} from '../pose-basic-semantics';
import type {PosePersonSemanticV3} from './schema';
/** Synchronize only the body/hand facts owned by a manual pose override. */
export function synchronizeBasicPosePromptV3(prompt:string,person:PosePersonSemanticV3,options:{structuredRelations?:boolean}={}):string{
 const audit=person.basicGeometry,override=person.basicPoseOverride;
 let text=prompt;
 if(audit&&override){
   if(override.templateId&&basicTemplateFromText(person.sourceText)!==audit.parameters.templateId){
     text=positivePoseText(text).replace(/\b(?:standing|sitting|seated|crouching|squatting|kneeling(?: on (?:one|both) knees?)?|reclining|lying(?: supine| face up| on (?:one|the) side)?)\b(?: on (?:a |the )?(?:chair|sofa|couch|bed|floor|ground))?/gi,'');
     const posture={stand:'standing',sit:'sitting',crouch:'crouching',kneel_single:'kneeling on one knee',kneel_double:'kneeling on both knees',recline:'reclining',lie_supine:'lying supine',lie_side:'lying on one side',lie_prone:'lying face down'}[audit.parameters.templateId];
     text=[text,posture,person.supportRelation.supportKind!=='unknown'?'supported by '+person.supportRelation.supportKind:''].filter(Boolean).join(', ');
   }
   if(override.bodyView)text=text.replace(/\b(?:front view|in profile|side view|left profile|right profile|three[- ]quarter view)\b/gi,'');
   if(override.kneeSpacing)text=text.replace(/\b(?:knees?|legs?)\s+(?:together|apart)\b/gi,'');
   const view={front:'front view',three_quarter:'three-quarter view',left_profile:'left profile',right_profile:'right profile'}[audit.parameters.view];
   const legs={natural:'natural relaxed knee spacing',together:'knees together',apart:'knees apart'}[audit.parameters.kneeSpacing];
   text=[text,override.bodyView?view:'',override.kneeSpacing&&audit.parameters.templateId==='sit'?legs:''].filter(Boolean).join(', ');
 }
 if(person.layers?.armSource==='manual'&&person.layers.armTemplateId&&!(options.structuredRelations&&person.relationTargets.length)){
   text=text.replace(/\b(?:with (?:the )?)?(?:both hands|two hands|one hand|single hand|left hand|right hand)\b/gi,'');
   const mode=person.handMode==='two'?'with both hands':person.activeHand==='left'?'with the left hand':'with the right hand';
   const task=person.layers.armTemplateId.startsWith('phone')?(person.gazeTarget.kind==='independent'?'holding a smartphone':'holding and viewing a smartphone'):'holding the declared object';
   text=[text,`${task} ${mode}`].join(', ');
 }
 const manualActions:Record<string,string>={pick:'picking up the declared object',place:'placing the declared object onto its support',push:'pushing the declared object',pull:'pulling the declared object',walk:'walking with alternating steps',run:'running',handshake:'shaking hands with the other person',highfive:'giving the other person a high five',handover:'handing over the shared object',embrace:'embracing the other person',support_walk:'supporting the other person with shoulder and arm contact',conversation:'facing the other person in conversation',reaction:'reacting to the other person',shared_prop:'sharing the same declared object',guide_pull:'guiding the other person by the hand',walk_together:'walking together',confrontation:'facing the other person in confrontation'};
 const selected=person.templateId==='support_walk'?(person.phase==='anticipation'?'preparing to support the other person, preserve a hand-shoulder gap':person.pairRole==='supported'?'leaning onto the supporting person with one foot planted':'supporting the other person with planted feet and shoulder-arm contact'):person.templateId==='guide_pull'?(person.pairRole==='supported'?'following the guiding person while holding their hand':'guiding the other person by the hand'):extraActionsV3[person.templateId]?.prompt||manualActions[person.templateId];
 if(person.source.kind==='manual'&&selected&&!(options.structuredRelations&&person.relationTargets.some(r=>r.actionPlan))){
   // Replace the old action phrase, including its complement, instead of leaving
   // fragments such as "at a sign" after removing only the verb.
   text=text.replace(/\b(?:pointing|reaching|bending|turning|nodding|writing|drinking|eating|opening|closing|pushing|pulling|picking up|placing|walking|running|shaking hands|embracing)\b[^,;.()]*[.]?/gi,'');
   text=[text,selected].filter(Boolean).join(', ');
 }

 if(person.loadSupport)text=[text,person.loadSupport.contactState==='approach'?'preparing to support the partner, hands approaching without contact, each person still bears their own weight':person.loadSupport.role==='active'?'supporting partner weight with a stable planted stance':'part of the weight supported by the partner, one foot planted'].join(', ');
 if(options.structuredRelations)return text;
 text=[text,...mechanismPromptTerms(person.actionRelationAudit?.geometry)].filter(Boolean).join(', ');
 const phase=person.actionRelationAudit;
 if(phase&&phase.contactState!=="contact"){
  text=text.replace(/\b(?:hands? physically contact(?:s)?|the declared hand physically contacts|holding|gripping)\b[^,;()]*[.]?/gi,'');
  text=[text,phase.contactState==='released'?'hands released from the supported object, preserve hand-object separation':'hand approaching the declared object without contact, preserve a visible gap'].join(', ');
 }
 return text;
}
