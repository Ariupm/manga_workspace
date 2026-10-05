import {aimHeadV3} from "./head-geometry";
import {extraActionsV3} from "./action-catalog";
import {ARM_RIG_V3} from "./rig";
import {forearmsIntersect} from "../../scripts/pose-overlay-guard.mjs";
import {basicTemplateFromText,type BasicTemplateId} from '../pose-basic-semantics';
import type {PoseControlOverrideV1,PosePoint,PosePersonPlanV2,PoseInteractionInput} from '../pose-v2';
import type {PosePersonSemanticV3} from './schema';
import {solveArmChain,type ArmSolveAudit} from './contact-geometry';
export type ArmTemplateId='hold_one'|'hold_two'|'phone_one'|'phone_two';
export type PoseLayers={bodyTemplateId:BasicTemplateId|null;armTemplateId:ArmTemplateId|null;armSource?:"automatic"|"manual"};
export type OverlayAudit={version:'pose-overlay-1'|'pose-overlay-2';arms:ArmSolveAudit[];errors:string[];warnings:string[]};
const basics=new Set(['stand','sit','crouch','kneel_single','kneel_double','recline','lie_supine','lie_side','lie_prone']);
const arms=new Set(['hold_one','hold_two','phone_one','phone_two']);
const bodyFamilies=new Set(['static','seated','lie','recline','crouch_kneel','locomotion']);
export function configurePoseLayers(person:PosePersonSemanticV3,previous?:PosePersonSemanticV3,raw?:PoseControlOverrideV1){
 const selectedAction=raw?.templateId&&!basics.has(raw.templateId)&&!arms.has(raw.templateId)?raw.templateId:null;
 const selectedBody=raw?.bodyTemplateId||(raw?.templateId&&basics.has(raw.templateId)?raw.templateId as BasicTemplateId:undefined);
 const selectedArm=raw?.armTemplateId||(raw?.templateId&&arms.has(raw.templateId)?raw.templateId as ArmTemplateId:undefined);
 if(raw?.templateId&&['walk','run'].includes(raw.templateId)){person.layers=undefined;}
 let body=selectedBody??previous?.layers?.bodyTemplateId??basicTemplateFromText(person.sourceText)??null;
 let arm=previous?.layers?.armTemplateId??null;
 let armSource: 'automatic'|'manual'=previous?.layers?.armSource||'automatic';
 const priorActions=previous?.actions||person.actions;
 if(!arm){
   if(priorActions.includes('read_phone')&&(/phone|手机/i.test(person.sourceText)||person.relationTargets.some(r=>/phone|手机/i.test(r.object)))&&(!person.relationTargets.length||person.relationTargets.some(r=>['read','inspect','operate'].includes(r.purpose))))arm=person.handMode==='two'?'phone_two':'phone_one';
   else if(priorActions.some(a=>['hold_carry','read_phone'].includes(a))||person.relationTargets.some(r=>['carry','hold'].includes(r.purpose)))arm=person.handMode==='two'?'hold_two':'hold_one';
 }
 if(raw?.templateId&&['walk','run'].includes(raw.templateId))body=null;
 if(selectedAction&&previous&&!['walk','run'].includes(selectedAction)){person.basePose=previous.basePose;}
 if(selectedAction&&!['walk','run','nod','look_up','head_turn','head_tilt'].includes(selectedAction)){arm=null;armSource='automatic';}
 if(selectedBody&&previous&&!selectedAction)person.actions=[...person.actions.filter(a=>bodyFamilies.has(a)),...previous.actions.filter(a=>!bodyFamilies.has(a))];
 if(selectedArm){
   arm=selectedArm==='none'?null:selectedArm;armSource='manual';if(!arm&&!person.relationTargets.length){person.handMode='one';person.activeHand=person.activeHand==='left'?'left':'right';person.handedness=person.activeHand;}
   if(previous&&!selectedBody){person.basePose=previous.basePose;person.locomotion=previous.locomotion;person.primaryAction=previous.primaryAction;}
   person.actions=(previous&&!selectedBody?previous.actions:person.actions).filter(a=>!['read_phone','hold_carry'].includes(a));
   if(arm)person.actions.push(arm.startsWith('phone')?'read_phone':'hold_carry');
 }
 if(!body&&arm&&!person.locomotion)body='stand';
 if(!arm&&raw?.handedness){person.activeHand=raw.handedness;person.handMode=raw.handedness==='both'?'two':'one';}
 if(arm){
   if(raw?.handedness==='both'&&!selectedArm)arm=arm.startsWith('phone')?'phone_two':'hold_two';
   person.handMode=arm.endsWith('two')?'two':'one';
   person.activeHand=person.handMode==='two'?'both':raw?.handedness==='left'?'left':raw?.handedness==='right'?'right':person.activeHand==='left'?'left':'right';
   person.handedness=person.activeHand;
 }
 if(arm?.startsWith('hold')&&!/phone|手机/i.test(person.sourceText)&&!person.relationTargets.some(r=>/phone|手机/i.test(r.object))){person.actions=person.actions.map(a=>a==='read_phone'?'hold_carry':a).filter((a,i,all)=>all.indexOf(a)===i);if(person.primaryAction==='read_phone')person.primaryAction='hold_carry';}
 if(person.relationTargets.length&&armSource!=='manual'&&!raw?.handedness){
   const hands=new Set(person.relationTargets.flatMap(r=>r.handMode==='two'?['left','right']:[r.activeHand]));
   person.activeHand=hands.size>1?'both':hands.has('left')?'left':'right';person.handMode=hands.size>1?'two':'one';person.handedness=person.activeHand;
   if(arm)arm=arm.startsWith('phone')?(person.handMode==='two'?'phone_two':'phone_one'):(person.handMode==='two'?'hold_two':'hold_one');
 }
 if(selectedBody||selectedArm||selectedAction){person.templateId=selectedAction||selectedBody||arm||body||(person.locomotion?.mode==='run'?'run':person.locomotion?'walk':person.templateId);person.source={kind:"manual",detail:"body/arm layers selected by pose override"};}
 if(!selectedArm&&['point','reach','pick','place','open','close','operate_environment','write','tool','drink','eat','push','pull'].includes(person.templateId)){arm=null;armSource='automatic';}
 if(arm){const family=arm.startsWith('phone')?'read_phone':'hold_carry';if(!person.actions.includes(family))person.actions.push(family);}
 person.supportHand=person.handMode==='two'?'left':null;person.layers={bodyTemplateId:body,armTemplateId:arm,armSource};person.secondaryActions=person.actions.filter(a=>a!==person.primaryAction);
}
const distance=(a:PosePoint,b:PosePoint)=>Math.hypot(a.x-b.x,a.y-b.y);
export function solvePoseOverlaysV3(people:PosePoint[][],plans:PosePersonSemanticV3[]){
 return people.map((original,i)=>{
 const p=original.map(q=>({...q})),person=plans[i],arm=person.layers?.armTemplateId;
 const audit:OverlayAudit={version:'pose-overlay-2',arms:[],errors:[],warnings:[]};const reserved=new Map<string,string>();const alternatives=new Map<'left'|'right',{points:PosePoint[];preference:PosePoint}>();
 const hips={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2},torso=distance(p[1],hips),upper=ARM_RIG_V3.upper,fore=ARM_RIG_V3.fore;
 const solve=(hand:'left'|'right',target:PosePoint,explicit:boolean,relationId?:string,purpose='hold')=>{
 const s=hand==='left'?5:2,e=hand==='left'?6:3,w=hand==='left'?7:4;
 if(reserved.has(hand)){audit.errors.push(`${hand} hand assigned to both ${reserved.get(hand)} and ${relationId||'overlay'}`);return;}
 reserved.set(hand,relationId||'overlay');
 const axis={x:(hips.x-p[1].x)/(torso||1),y:(hips.y-p[1].y)/(torso||1)};
 const outward=Math.sign((p[s].x-p[1].x)*axis.y-(p[s].y-p[1].y)*axis.x)||(hand==='left'?1:-1);
 const down=arm?.startsWith('phone')||!['operate','place'].includes(purpose);
 let preference=!explicit&&!arm?{...p[e]}:{x:p[s].x+axis.x*upper*(down?1:-.5)+axis.y*outward*upper*.65,y:p[s].y+axis.y*upper*(down?1:-.5)-axis.x*outward*upper*.65};
 const projectedUpper=upper*.89,projectedFore=fore*.47,targetDistance=distance(p[s],target);
 const inFront=(arm?.startsWith('phone')||['drink','eat','self_touch'].includes(person.templateId))&&targetDistance>=Math.abs(projectedUpper-projectedFore)+1e-6&&targetDistance<=projectedUpper+projectedFore-1e-6;
 let armUpper=inFront?projectedUpper:upper,armFore=inFront?projectedFore:fore;
 // Cradling projects the forearm toward the viewer. Keep the wrist authored
 // by the object contract, and derive depth from a relaxed, low-abduction elbow.
 let cradled=false;
 if(arm?.startsWith('hold')&&['hold','carry','inspect','read','watch'].includes(purpose)&&targetDistance<=upper+fore){
   const elbow={x:p[s].x+axis.x*upper*.96+axis.y*outward*.018,y:p[s].y+axis.y*upper*.96-axis.x*outward*.018};
   const projected=distance(elbow,target),along=(target.x-p[s].x)*axis.x+(target.y-p[s].y)*axis.y;
   if(along>0&&projected>=.035&&projected<=fore&&distance(p[s],elbow)<=upper){armUpper=distance(p[s],elbow);armFore=projected;preference=elbow;cradled=true;}
 }
 // Approach projects a forward-reaching arm into the image plane. A nearby
 // target must not force a full planar arm to fold back past the wrist.
 const approaching=explicit&&person.actionRelationAudit?.contactState==='approach'&&['pick','place'].includes(person.templateId);
 if(approaching&&targetDistance>1e-6&&targetDistance<upper+fore){
   const ratio=Math.min(1,targetDistance/((upper+fore)*.9));
   armUpper=upper*ratio;armFore=fore*ratio;
   const ux=(target.x-p[s].x)/targetDistance,uy=(target.y-p[s].y)/targetDistance;
   const bend=ux*axis.y-uy*axis.x>=0?1:-1;
   preference={x:(p[s].x+target.x)/2-uy*bend*upper*.2,y:(p[s].y+target.y)/2+ux*bend*upper*.2};
 }
 const solution=solveArmChain(p[s],target,armUpper,armFore,preference);
 p[e]=solution.elbow;p[w]=solution.wrist;if(solution.reachable)alternatives.set(hand,{points:solution.candidates,preference});
 const error=solution.reachable?null:`${person.characterId}:${hand} contact target is beyond arm reach`;
 audit.arms.push({hand,relationId,source:explicit?'explicit_contact':'automatic_overlay',target:{...target},upperLength:armUpper,foreLength:armFore,upperBoneLength:upper,foreBoneLength:fore,depthAssumption:inFront||cradled||approaching?'front_of_body':'planar',depthOffsets:{elbow:Math.sqrt(Math.max(0,upper*upper-armUpper*armUpper)),wrist:Math.sqrt(Math.max(0,upper*upper-armUpper*armUpper))+Math.sqrt(Math.max(0,fore*fore-armFore*armFore))},reachable:solution.reachable,error});if(error)audit.errors.push(error);
 };
 for(const contact of person.actionContacts||[])solve(contact.hand,contact.target,true,contact.relationId);
 for(const relation of person.relationTargets){
 const hands=relation.handMode==='two'?['left','right'] as const:[relation.activeHand==='left'?'left':'right'] as const;
 if(relation.conflict)audit.errors.push(`${relation.relationId||relation.object}: ${relation.conflict}`);
 const anchors=relation.contactAnchors||[];
 for(const hand of hands){const a=anchors.find(a=>a.hand===hand)||relation.wristAssignments?.find(a=>a.hand===hand);
 if(!a){audit.errors.push(`${relation.relationId||relation.object}: missing ${hand} contact anchor`);continue;}
 const phaseTarget=relation.actionRelationAudit?.handTargets.find(t=>t.hand===hand);
 solve(hand,phaseTarget||a,true,relation.relationId,relation.purpose);
 }
 }
 if(arm){
 const wanted=person.handMode==='two'?['right','left'] as const:[person.activeHand==='left'?'left':'right'] as const;
 if(person.relationTargets.length&&person.layers?.armSource==="manual"){
 if(arm.startsWith("phone")&&person.relationTargets.some(r=>!/(?:phone|手机)/i.test(r.object)))audit.errors.push(`${person.characterId}: phone overlay conflicts with declared object`);const actual=[...reserved.keys()];if(wanted.some(h=>!reserved.has(h)))audit.errors.push(`${person.characterId}: selected ${arm} conflicts with declared interaction hand mode`);
 if(person.handMode==='one'&&actual.length>1)audit.errors.push(`${person.characterId}: single-hand template conflicts with two-hand interaction`);
 }else if(!person.relationTargets.length){
 const axis={x:(hips.x-p[1].x)/(torso||1),y:(hips.y-p[1].y)/(torso||1)};
 const height=arm.startsWith('phone')?.55:.75;const lying=person.basePose==='lie';const center={x:p[1].x+axis.x*torso*(lying?.4:height),y:p[1].y+axis.y*torso*(lying?.4:height)-(lying?.16:0)};
 for(const hand of wanted){const s=hand==='left'?5:2;const side=Math.sign((p[s].x-p[1].x)*axis.y-(p[s].y-p[1].y)*axis.x)||(hand==='left'?1:-1);const target={x:center.x+axis.y*side*.045,y:center.y-axis.x*side*.045};solve(hand,target,false);}
 }
 if(arm.startsWith('phone')||person.gazeTarget.point||person.actions.includes('read_phone')){
 const target=person.gazeTarget.point;
 const independent=person.gazeTarget.kind==='independent'&&(person.gazeTarget.source!=='scene_plan.no_structured_gaze_target'||/look(?:ing)? (?:away|at (?:the )?camera)|看向镜头|望向别处/i.test(person.sourceText));
 const gaze=independent?null:target||(audit.arms.length?{x:audit.arms.reduce((a,b)=>a+b.target.x,0)/audit.arms.length,y:audit.arms.reduce((a,b)=>a+b.target.y,0)/audit.arms.length}:null);
 if(gaze){if(!target)person.gazeTarget={kind:"object",point:{...gaze},targetId:null,source:arm.startsWith("phone")?"pose_overlay.phone_default":"pose_overlay.object_default"};const hx=gaze.x-p[0].x,hy=gaze.y-p[0].y;person.headDirection={target:{...gaze},dx:hx,dy:hy,mode:Math.abs(hx)<.045?(hy>=0?"down":"up"):hy>=0?(hx<0?"down_left":"down_right"):(hx<0?"up_left":"up_right")};aimHeadV3(p,gaze,person.mirror);}
 }
 }
 if((arm==='phone_two'||arm==='hold_two')&&forearmsIntersect(p)&&!/cross(?:ed|ing)?\s+(?:arms|forearms)|交叉.*(?:手|臂)/i.test(person.sourceText)){
   const right=alternatives.get('right'),left=alternatives.get('left');
   if(right&&left){const options=right.points.flatMap(r=>left.points.map(l=>({r,l,score:distance(r,right.preference)+distance(l,left.preference)}))).sort((a,b)=>a.score-b.score);
     for(const option of options){const candidate=p.map(q=>({...q}));candidate[3]=option.r;candidate[6]=option.l;if(!forearmsIntersect(candidate)){p[3]=option.r;p[6]=option.l;break;}}
   }
 }
 // Free arms use the same physical rig as the rest pose and bound contacts.
 for(const hand of ['right','left'] as const){if(reserved.has(hand))continue;const w=hand==='left'?7:4;solve(hand,p[w],false);}
 person.targetId=person.gazeTarget.targetId;person.overlayAudit=audit;return p;
 });
}

export function overlayFailureTextV3(error:string){
 if(error.includes('待定')||error.includes('口部')||error.includes('工作面'))return error;
 if(error.includes('declared gaze target'))return '所选头部动作与剧情视线目标冲突，请调整视线关系。';
 if(error.includes('interaction purpose'))return '所选动作与剧情道具交互用途冲突，请先调整交互关系。';
 const hand=error.includes(':left')?'左手':error.includes(':right')?'右手':'手部';
 if(error.includes('beyond arm reach'))return hand+'接触目标超出可达范围，请调整道具位置或身体姿态。';
 if(error.includes('hand mode')||error.includes('single-hand template'))return '单／双手选择与当前剧情交互不一致，请调整交互关系。';
 if(error.includes('declared object'))return '手机动作与当前剧情道具不一致。';
 if(error.includes('assigned to both')||error.includes('multiple relations'))return '同一只手被多个互斥交互占用。';
 if(error.includes('missing')&&error.includes('anchor'))return '当前交互缺少对应手部接触点。';
 if(error.includes('bone lengths'))return '编辑后的臂长超出当前人体比例，请调整肘腕位置。';
 if(error.includes('declared contact'))return '编辑后的手腕偏离剧情接触点。';
 if(error.includes('crossed forearms'))return '普通双手手机姿态出现意外交叉，请调整接触侧。';
 if(error.includes('crop includes torso'))return '当前头肩／胸部景别容不下完整动作与道具，请扩大景别或调整交互位置。';
 if(error.includes('crop still'))return '当前景别仍露出膝脚，请调整景别或骨架。';
 return error;
}

/** Legacy V2 normalization must not clamp explicitly authored V3 contacts. */
export function restoreExplicitContactsV3(people:PosePersonPlanV2[],relations:PoseInteractionInput[]){
 for(const person of people){const own=relations.filter(r=>r.characterId===person.characterId&&r.required);
   person.relationTargets.forEach((target,index)=>{
     const relation=own.find(r=>r.relationId&&r.relationId===target.relationId)||own[index];if(!relation)return;
     target.target={...relation.objectCenter};target.handMode=relation.handMode;target.activeHand=relation.activeHand||(relation.handMode==='two'?'both':'right');
     if(relation.contactAnchors?.length){target.contactAnchors=relation.contactAnchors.map(a=>({...a}));target.wristAssignments=undefined;}
   });
   if(own.length)person.target={...own[0].objectCenter};
 }
}
export function poseOverlayBindingFailuresV3(people:PosePersonSemanticV3[]){return people.filter(p=>!p.relationTargets.length&&((p.layers?.armSource==='manual'&&p.layers.armTemplateId)||(p.source.kind==='manual'&&['pick','place','push','pull','open','close','operate_environment','write','tool','drink','eat','shared_prop','handover'].includes(p.templateId)))).map(p=>p.characterId);}
