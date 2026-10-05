import {upperTorsoFramingFailures} from "../../scripts/pose-framing-guard.mjs";
import type { PosePoint } from "../pose-v2";
import type { ActionEvidenceV3, CompositionKindV3, CompositionPolicyV3, ProjectionPlanV3, VisibilityV3 } from "./schema";
import { propBodySizePlan } from "../../scripts/sd-worker-logic.mjs";
const propEnvelope = (e: ActionEvidenceV3, scale: number) => e.propFootprint ? propBodySizePlan({ ...e.propFootprint, contactSpan: e.propFootprint.contactSpan * scale, regionWidth: e.propFootprint.regionWidth * scale }).envelope : null;
const kinds: CompositionKindV3[] = ["head_shoulders", "chest_action", "waist_up", "knee_up", "full_body", "environment_full"];
export const isUpperCompositionV3 = (kind: CompositionKindV3) => kinds.indexOf(kind) <= 2;
const visible=(p:PosePoint)=>p.x>=.02&&p.x<=.98&&p.y>=.02&&p.y<=.98;
const hash=(v:string)=>{let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,"0")};
export function projectionFramingFailuresV3(projected: PosePoint[][], composition: CompositionKindV3) {
 const failures:string[]=[];
 if(isUpperCompositionV3(composition)&&projected.some(p=>[9,10,12,13].some(i=>p[i]&&visible(p[i]))))failures.push(`requested ${composition} crop still includes knees or feet`);
 failures.push(...upperTorsoFramingFailures(projected,composition));
 return failures;
}
export function transformPeopleV3(people:PosePoint[][],scale:number,translate:PosePoint){return people.map(p=>p.map(q=>({x:(q.x-.5)*scale+.5+translate.x,y:(q.y-.5)*scale+.5+translate.y})))}
// Legacy evidence without an actor binding must hold for every actor.
export function evaluateJointEvidenceV3(projected: PosePoint[][], evidence: ActionEvidenceV3[], projection?: Pick<ProjectionPlanV3, "scale" | "translate">) {
 return Object.fromEntries(evidence.map(e => {
  const points = projection && e.points?.length ? transformPeopleV3([e.points], projection.scale, projection.translate)[0] : e.points;
  if (points?.some(p => !visible(p))) return [e.id, false];
  const envelope = propEnvelope(e, projection?.scale || 1);
  if (envelope && points?.some(p => p.x-envelope.width/2 < .02-1e-8 || p.x+envelope.width/2 > .98+1e-8 || p.y-envelope.height/2 < .02-1e-8 || p.y+envelope.height/2 > .98+1e-8)) return [e.id, false];
  if (!e.jointIndices?.length) return [e.id, true];
  const subjects = e.personIndex === undefined ? projected : [projected[e.personIndex]];
  return [e.id, subjects.length > 0 && subjects.every(person =>
   !!person && e.jointIndices!.every(index => !!person[index] && visible(person[index])))];
 }));
}
export function compositionForCameraV3(camera: string): CompositionKindV3 | undefined {
 if (/extreme wide|establishing|大远景|建立镜头/i.test(camera)) return "environment_full";
 if (/wide|full.?body|full shot|全景|远景/i.test(camera)) return "full_body";
 if (/knee|cowboy|膝/i.test(camera)) return "knee_up";
 if (/medium close|close shot|chest|胸|近景/i.test(camera)) return "chest_action";
 if (/close|head.and.shoulders|特写/i.test(camera)) return "head_shoulders";
 if (/medium|waist|中景|半身/i.test(camera)) return "waist_up";
 return undefined;
}

export function frameActionEvidenceV3(evidence: ActionEvidenceV3[], preferred?: CompositionKindV3): ActionEvidenceV3[] {
 return evidence.map(e => {
  const joints = e.fullPoseJointIndices || e.jointIndices;
  if (!preferred || !isUpperCompositionV3(preferred) || !joints?.some(i => i >= 8 && i <= 13)) return {...e};
  // Keep the complete action topology for audit, while requiring only the
  // head, torso and arms as its visible evidence in an upper-body shot.
  return {...e, fullPoseJointIndices: [...joints], description: `${e.description}（上身景别仅校验头、躯干与手臂；画外下肢保留在完整动作中）`, jointIndices: [...new Set([0, 1, 2, 5, ...joints.filter(i => i < 8 || i > 13)])]};
 });
}

export function chooseProjectionV3(full:PosePoint[][],evidence:ActionEvidenceV3[],policy:CompositionPolicyV3,preferred?:CompositionKindV3):ProjectionPlanV3|null{
 if (!full.length || full.some(p => p.length < 18)) return null;
 const plans = kinds.map(composition => {
  const indices = composition === "head_shoulders" ? [0,1,2,5,14,15,16,17]
   : composition === "chest_action" ? [0,1,2,3,4,5,6,7,14,15,16,17]
   : composition === "waist_up" ? [0,1,2,3,4,5,6,7,8,11,14,15,16,17]
   : composition === "knee_up" ? [0,1,2,3,4,5,6,7,8,9,11,12,14,15,16,17]
   : Array.from({length:18}, (_,i) => i);
  const points = full.flatMap(p => indices.map(i => p[i]));
  const propEvidence = evidence.filter(e=>e.required && e.points?.length);
  let fitPoints = [...points, ...propEvidence.flatMap(e=>e.points!)];
  const padding = composition === "environment_full" ? .18 : .045;
  let scale=1, translate={x:0,y:0};
  // Reserve the same canvas-space prop envelope used by the worker. Refit in
  // source coordinates; never move a prop independently of its contact hand.
  for(let iteration=0;iteration<32;iteration++) {
    const minX=Math.min(...fitPoints.map(p=>p.x)),maxX=Math.max(...fitPoints.map(p=>p.x));
    const minY=Math.min(...fitPoints.map(p=>p.y)),maxY=Math.max(...fitPoints.map(p=>p.y));
    const left=minX-padding,right=maxX+padding,top=minY-padding,bottom=maxY+(isUpperCompositionV3(composition)?.015:padding);
    scale=Math.min(.96/Math.max(.1,right-left),.96/Math.max(.1,bottom-top));
    translate={x:(.5-(left+right)/2)*scale,y:(.5-(top+bottom)/2)*scale};
    if(!propEvidence.length)break;
    fitPoints=[...points,...propEvidence.flatMap(e=>{
      const size=propEnvelope(e,scale);
      if (!size) return e.points!;
      return e.points!.flatMap(p=>[{x:p.x-size.width/(2*scale),y:p.y-size.height/(2*scale)},{x:p.x+size.width/(2*scale),y:p.y+size.height/(2*scale)}]);
    })];
  }
  let projected=transformPeopleV3(full,scale,translate);
  // Align a real upper-body crop within its available headroom. Fit padding
  // must not leave a knee just inside the viewport when all action evidence
  // can still fit after translating the whole scene (including props).
  if(isUpperCompositionV3(composition)&&projectionFramingFailuresV3(projected,composition).length){
    const lower=projected.flatMap(p=>{
      const joints=[9,10,12,13].map(j=>p[j]);
      if(composition==="head_shoulders"||composition==="chest_action"){
        const hip={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};
        joints.push(composition==="head_shoulders"?{x:p[1].x+(hip.x-p[1].x)*.55,y:p[1].y+(hip.y-p[1].y)*.55}:hip);
      }
      return joints;
    }).filter(p=>p.x>=.02&&p.x<=.98&&p.y>=.02);
    const delta=lower.length?Math.max(0,.981-Math.min(...lower.map(p=>p.y))):0;
    const aligned={x:translate.x,y:translate.y+delta};
    const candidate=transformPeopleV3(full,scale,aligned);
    const fits=transformPeopleV3([fitPoints],scale,aligned)[0].every(visible);
    const evidenceFits=evaluateJointEvidenceV3(candidate,evidence,{scale,translate:aligned});
    if(fits&&!projectionFramingFailuresV3(candidate,composition).length&&evidence.filter(e=>e.required).every(e=>evidenceFits[e.id])){translate=aligned;projected=candidate;}
  }
  const evidenceVisible=evaluateJointEvidenceV3(projected,evidence,{scale,translate});
  const hardFailures=evidence.filter(e=>e.required&&!evidenceVisible[e.id]).map(e=>`required evidence out of frame: ${e.id}`);
  hardFailures.push(...projectionFramingFailuresV3(projected,composition));
  const visibility:VisibilityV3[][]=projected.map(p=>p.map(q=>visible(q)?"visible":"out_of_frame"));
  const score=-1000*hardFailures.length+scale;
  return {id:`projection-${hash(JSON.stringify({composition,scale,translate,evidenceVisible}))}`,composition,scale,translate,viewport:{x:0,y:0,width:1,height:1},visibility,evidenceVisible,score,hardFailures,
   source:policy==="locked"?"user_locked" as const:policy==="preferred"?"user_preference" as const:"auto_story" as const};
 });
 if(preferred&&["head_shoulders","chest_action"].includes(preferred))return plans.find(p=>p.composition===preferred)!;
 if(policy==="locked"&&preferred)return plans.find(p=>p.composition===preferred)!;
 const valid=plans.filter(p=>!p.hardFailures.length);
 if(preferred){
  const rank=kinds.indexOf(preferred);
  if(isUpperCompositionV3(preferred)){
   const allowed=plans.filter(p=>kinds.indexOf(p.composition)>=rank&&isUpperCompositionV3(p.composition));
   return allowed.find(p=>!p.hardFailures.length)||allowed.sort((a,b)=>b.score-a.score)[0];
  }
  const allowed=plans.filter(p=>kinds.indexOf(p.composition)>=rank);
  return allowed.find(p=>!p.hardFailures.length)||allowed.sort((a,b)=>b.score-a.score)[0];
 }
 return (valid.length?valid:plans).sort((a,b)=>b.score-a.score)[0]||null;
}
export const projectionHashV3=(p:ProjectionPlanV3|null)=>p?hash(JSON.stringify(p)):null;
