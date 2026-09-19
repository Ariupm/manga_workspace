import type { PosePoint } from "../pose-v2";
import type { ActionEvidenceV3, CompositionKindV3, CompositionPolicyV3, ProjectionPlanV3, VisibilityV3 } from "./schema";
const candidates: Array<{kind:CompositionKindV3;scale:number;centerY:number}>=[{kind:"head_shoulders",scale:2.05,centerY:.28},{kind:"chest_action",scale:1.65,centerY:.38},{kind:"waist_up",scale:1.35,centerY:.46},{kind:"knee_up",scale:1.12,centerY:.52},{kind:"full_body",scale:.9,centerY:.52},{kind:"environment_full",scale:.72,centerY:.52}];
const visible=(p:PosePoint)=>p.x>=.02&&p.x<=.98&&p.y>=.02&&p.y<=.98;
const hash=(v:string)=>{let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,"0")};
export function transformPeopleV3(people:PosePoint[][],scale:number,translate:PosePoint){return people.map(p=>p.map(q=>({x:(q.x-.5)*scale+.5+translate.x,y:(q.y-.5)*scale+.5+translate.y})))}
export function chooseProjectionV3(full:PosePoint[][],evidence:ActionEvidenceV3[],policy:CompositionPolicyV3,preferred?:CompositionKindV3):ProjectionPlanV3|null{
 if(!full.length)return null;const pts=full.flat();const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
 const ordered=preferred?[...candidates].sort((a,b)=>Number(b.kind===preferred)-Number(a.kind===preferred)):candidates;
 const plans=ordered.map(c=>{const translate={x:.5-(minX+maxX)/2,y:c.centerY-(minY+maxY)/2};const projected=transformPeopleV3(full,c.scale,translate);const evidenceVisible=Object.fromEntries(evidence.map(e=>[e.id,!e.jointIndices?.length||projected.some(p=>e.jointIndices!.every(i=>p[i]&&visible(p[i])))]));const hardFailures=evidence.filter(e=>e.required&&!evidenceVisible[e.id]).map(e=>`required evidence out of frame: ${e.id}`);const visibility:VisibilityV3[][]=projected.map(p=>p.map(q=>visible(q)?"visible":"out_of_frame"));const score=(hardFailures.length?-1000*hardFailures.length:0)+visibility.flat().filter(x=>x==="visible").length+c.scale*8;return{id:`projection-${hash(JSON.stringify({c,translate,evidenceVisible}))}`,composition:c.kind,scale:c.scale,translate,viewport:{x:0,y:0,width:1,height:1},visibility,evidenceVisible,score,hardFailures,source:policy==="locked"?"user_locked" as const:policy==="preferred"?"user_preference" as const:"auto_story" as const}});
 return policy==="locked"?plans[0]:plans.sort((a,b)=>b.score-a.score)[0]||null;
}
export const projectionHashV3=(p:ProjectionPlanV3|null)=>p?hash(JSON.stringify(p)):null;
