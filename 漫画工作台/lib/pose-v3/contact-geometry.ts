import {ARM_RIG_V3} from "./rig";
import type {PosePoint,PosePersonPlanV2} from '../pose-v2';
export type ArmSolveAudit={hand:'left'|'right';relationId?:string;source:'explicit_contact'|'automatic_overlay';target:PosePoint;upperLength:number;foreLength:number;reachable:boolean;error:string|null;upperBoneLength?:number;foreBoneLength?:number;depthAssumption?:'front_of_body'|'planar';depthOffsets?:{elbow:number;wrist:number}};
export function solveArmChain(shoulder:PosePoint,target:PosePoint,upper:number,fore:number,preference:PosePoint){
 const dx=target.x-shoulder.x,dy=target.y-shoulder.y,d=Math.hypot(dx,dy);
 const reachable=d<=upper+fore+1e-8&&d>=Math.abs(upper-fore)-1e-8;
 const r=Math.max(Math.abs(upper-fore),Math.min(upper+fore,d));
 const ux=d>1e-9?dx/d:0,uy=d>1e-9?dy/d:1;
 const along=(upper*upper-fore*fore+r*r)/(2*r),height=Math.sqrt(upper*upper-along*along<1e-14?0:upper*upper-along*along);
 const candidates=[1,-1].map(sign=>({x:shoulder.x+ux*along-sign*uy*height,y:shoulder.y+uy*along+sign*ux*height}));
 candidates.sort((a,b)=>Math.hypot(a.x-preference.x,a.y-preference.y)-Math.hypot(b.x-preference.x,b.y-preference.y));
 return {reachable,elbow:candidates[0],candidates,wrist:reachable?{x:target.x,y:target.y}:{x:shoulder.x+ux*r,y:shoulder.y+uy*r}};
}
/** Full-source geometry only. Explicit contacts are never moved to make an invalid pose pass. */
export function solvePortableContactsV3(people:PosePoint[][],plans:PosePersonPlanV2[]){
 const result=people.map(p=>p.map(q=>({...q})));
 result.forEach((p,i)=>{const used=new Set<string>();for(const relation of plans[i]?.relationTargets||[]){
 if(relation.conflict)continue;const requested=relation.handMode==='two'?['left','right']:[relation.activeHand];
 const assignments=relation.contactAnchors?.length?relation.contactAnchors:relation.wristAssignments||[];
 for(const a of assignments){if(!requested.includes(a.hand)||used.has(a.hand))continue;used.add(a.hand);
 const s=a.hand==='left'?5:2,e=a.hand==='left'?6:3,w=a.hand==='left'?7:4;if(!p[s]||!p[w])continue;
 const pelvis={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};const torso=Math.hypot(p[1].x-pelvis.x,p[1].y-pelvis.y);
 const upper=ARM_RIG_V3.upper,fore=ARM_RIG_V3.fore;
 const cradled=relation.handMode==='two'&&!['operate','place'].includes(relation.purpose);
 const outward=Math.sign(p[s].x-p[1].x)||(a.hand==='left'?1:-1);
 const preference={x:(p[s].x+a.x)/2,y:cradled?a.y+upper*3:p[s].y-upper*3};
 const solved=solveArmChain(p[s],a,upper,fore,preference);p[e]=solved.elbow;p[w]=solved.wrist;
 }
 }});return result;
}
