import {ARM_RIG_V3} from "./rig";
import { basicTemplateFromText, type BasicTemplateId } from '../pose-basic-semantics';
import type { PosePoint, SupportRelationGeometry } from '../pose-v2';
import type { PosePersonSemanticV3 } from './schema';

export const BASIC_GEOMETRY_VERSION = 'basic-pose-1';
export type BasicPoseParameters = {
  templateId: BasicTemplateId; view: 'front'|'three_quarter'|'left_profile'|'right_profile';
  kneeSpacing: 'natural'|'together'|'apart'; supportSide: 'left'|'right';
  variant: 'default'|'floor_sit'|'cross_legged'|'standing_lean'|'kneeling_sit';
};
export type BasicGeometryAudit = {
  version: typeof BASIC_GEOMETRY_VERSION; parameters: BasicPoseParameters;
  contacts: Array<{joint: number; point: PosePoint; surfaceOffset: number}>;
  supported: boolean; warnings: string[];
};
const basicIds=new Set(['stand','sit','crouch','kneel_single','kneel_double','recline','lie_supine','lie_side','lie_prone']);
export function basicParameters(person: PosePersonSemanticV3): BasicPoseParameters | null {
  const s=person.sourceText;
  let id=person.layers?.bodyTemplateId || (basicIds.has(person.templateId)?person.templateId as BasicTemplateId:undefined);
  if (!id && person.basePose!=='standing') id=basicTemplateFromText(s);
  if (!id && (person.basePose==='standing'||person.primaryAction==='locomotion')) id='stand';
  if (!id) return null;
  return {templateId:id,
    view:person.basicPoseOverride?.bodyView ?? (/\bin profile\b|\bside view\b|侧身|侧面/i.test(s)?(/left|左/i.test(s)?'left_profile':'right_profile'):/front view|正面/i.test(s)||id==='stand'||id.startsWith('lie_')?'front':'three_quarter'),
    kneeSpacing:person.basicPoseOverride?.kneeSpacing ?? (/knees? together|legs? together|并膝|并腿|双腿并拢/i.test(s)?'together':/knees? apart|legs? apart|分腿|双腿分开/i.test(s)?'apart':'natural'),
    supportSide:/left knee|左膝/i.test(s)?'left':'right',
    variant:/cross[- ]legged|盘腿/i.test(s)?'cross_legged':/sit(?:ting)? on (?:the )?(?:floor|ground)|坐在?地(?:上|面)|坐地/i.test(s)?'floor_sit':/stand(?:ing)?|站/i.test(s)&&id==='recline'?'standing_lean':/sit(?:ting)? on .*heels|跪坐/i.test(s)?'kneeling_sit':'default'};
}

/** Local depth distinguishes foreshortening from accidental bone compression. */
type LocalPoint={x:number;y:number;z:number};
export function buildBasicGeometry(person: PosePersonSemanticV3, old: PosePoint[]): PosePoint[] {
  const params=basicParameters(person);if(!params)return old.map(p=>({...p}));
  const id=params.templateId,cx=person.anchor.x;
  const local:LocalPoint[]=old.map(p=>({x:p.x-cx,y:p.y,z:0}));
  const set=(i:number,x:number,y:number,z=0)=>{local[i]={x,y,z}};
  let hipY=.52,neckX=0,neckY=.27;
  if(id==='sit'){hipY=.55;neckY=.30;}
  if(id==='crouch'){hipY=.765;neckY=.515;neckX=.025;}
  if(id==='kneel_single'){hipY=.62;neckY=.37;}
  if(id==='kneel_double'){hipY=params.variant==='kneeling_sit'?.73:.65;neckY=hipY-.25;}
  if(id==='recline'&&params.variant!=='standing_lean'){hipY=.55;neckX=-.12;neckY=.33;}
  if(id==='recline'&&params.variant==='standing_lean'){hipY=.52;neckX=-.065;neckY=.28;}
  set(1,neckX,neckY);set(0,neckX,neckY-.105);
  set(2,neckX-.09,neckY+.025);set(5,neckX+.09,neckY+.025);
  set(8,-.055,hipY);set(11,.055,hipY);
  set(9,-.075,.70);set(12,.075,.70);set(10,-.085,.90);set(13,.085,.90);
  if(id==='sit'){
    const gap=params.kneeSpacing==='together'?.024:params.kneeSpacing==='apart'?.11:.06;
    for(const [h,k,a,sign] of [[8,9,10,-1],[11,12,13,1]]){set(k,sign*gap,hipY+.015,.175);set(a,sign*(gap+.006),hipY+.215,.175);}
    if(params.variant==='floor_sit'||params.variant==='cross_legged'){
      hipY=.80;neckY=.55;set(8,-.055,hipY);set(11,.055,hipY);set(1,0,neckY);set(0,0,neckY-.105);set(2,-.09,neckY+.025);set(5,.09,neckY+.025);
      set(9,-.16,.80,.13);set(12,.16,.80,.13);set(10,.04,.85,.08);set(13,-.04,.85,.08);
    }
  }
  if(id==='crouch'){
    for(const [k,a,sign] of [[9,10,-1],[12,13,1]]){set(k,sign*.095,.685,.175);set(a,sign*.09,.875,.015);}
  }
  if(id==='kneel_single'){
    const left=params.supportSide==='left';const kneeling=left?[11,12,13,1]:[8,9,10,-1];const foot=left?[8,9,10,-1]:[11,12,13,1];
    set(kneeling[1],kneeling[3]*.065,.88,.015);set(kneeling[2],kneeling[3]*.065,.88,-.175);
    set(foot[1],foot[3]*.07,.67,.17);set(foot[2],foot[3]*.07,.88,.17);
  }
  if(id==='kneel_double'){
    for(const [k,a,sign] of [[9,10,-1],[12,13,1]]){set(k,sign*.06,.88,.025);set(a,sign*.06,.88,-.17);}
  }
  if(id==='recline'&&params.variant!=='standing_lean'){
    set(9,-.065,.57,.175);set(12,.065,.57,.175);set(10,-.072,.77,.175);set(13,.072,.77,.175);
  }
  const hasArmAction=person.actions.some(a=>!['static','seated','crouch_kneel','lie','recline'].includes(a))||person.relationTargets.length>0;
  for(const [s,e,w,sign] of [[2,3,4,-1],[5,6,7,1]]){
    const shoulder=local[s];
    {set(e,shoulder.x+sign*.02,shoulder.y+Math.sqrt(ARM_RIG_V3.upper**2-.02**2));set(w,shoulder.x+sign*.015,local[e].y+Math.sqrt(ARM_RIG_V3.fore**2-.005**2));}
  }
  if(id==='sit'||id==='recline'){for(const [h,w] of [[8,4],[11,7]]){set(w,local[h].x,hipY+.005);}}
  if(id.startsWith('lie_')){
    // Rotate the entire local body/face frame, rather than regenerating an upright face.
    const side=id==='lie_side';
    set(1,-.17,.55);set(0,-.275,.55);
    set(2,-.16,side?.532:.48);set(5,-.15,side?.568:.62);
    set(8,.08,side?.536:.50);set(11,.085,side?.564:.60);
    set(9,.25,side?.64:.49);set(12,.235,side?.69:.615);
    set(10,.455,side?.59:.48);set(13,.405,side?.66:.62);
    if(id==='lie_prone'){set(9,.26,.57);set(12,.25,.65);set(10,.43,.48);set(13,.42,.56);set(0,-.275,.58);}
    {for(const [a,e,w] of [[2,3,4],[5,6,7]]){set(e,local[a].x+ARM_RIG_V3.upper,local[a].y);set(w,local[e].x+ARM_RIG_V3.fore,local[e].y);}}
  }
  const yaw=params.view==='front'?0:params.view==='three_quarter'?Math.PI*.22:params.view==='left_profile'?-Math.PI*.40:Math.PI*.40;
  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const project=(p:LocalPoint):PosePoint=>({x:cx+p.x*cy+p.z*sy,y:p.y+p.z*.28});
  const result=local.map(project);
  const horizontal=id.startsWith('lie_');const faceAxis=horizontal?{x:0,y:1}:{x:cy,y:0};
  // Preserve explicit pitch/yaw offsets from the existing head-direction compiler.
  const head=result[0],pitch=person.headDirection?.dy||0;
  for(const [i,d] of [[14,-.025],[15,.025],[16,-.045],[17,.045]])result[i]={x:head.x+faceAxis.x*d+(horizontal?-.01:0),y:head.y+faceAxis.y*d+(horizontal?0:-.01+pitch*.015)};
  if(!horizontal&&hasArmAction&&!person.layers?.armTemplateId){const offset={x:old[0].x-old[1].x,y:old[0].y-old[1].y};result[0]={x:result[1].x+offset.x,y:result[1].y+offset.y};for(const i of [14,15,16,17]){result[i].x+=result[0].x-head.x;result[i].y+=result[0].y-head.y;}}
  if(person.mirror)for(const p of result)p.x=2*cx-p.x;
  alignBasicSupport(person,result,params);
  return result;
}

function alignBasicSupport(person:PosePersonSemanticV3,p:PosePoint[],params:BasicPoseParameters){
  const old=person.supportRelation;const id=params.templateId;
  const pelvis={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};
  let kind:SupportRelationGeometry['supportKind']=old.supportKind;
  if(/\b(?:floor|ground)\b|地上|地面|坐地/i.test(person.sourceText)&&basicTemplateFromText(person.sourceText)===id)kind='floor';
  if(['stand','crouch','kneel_single','kneel_double'].includes(id))kind='floor';
  if(params.variant==='standing_lean')kind=/wall|墙/i.test(person.sourceText)?'wall':'unknown';
  const joints=id==='stand'||id==='crouch'?[10,13]:id==='kneel_double'?[9,12]:id==='kneel_single'?[params.supportSide==='left'?12:9,params.supportSide==='left'?10:13]:[8,11];
  const plane=Math.max(...(id.startsWith('lie_')?p.slice(0,14).map(q=>q.y):joints.map(j=>p[j].y)))+(joints.includes(8)?.045:.02);
  const cx=pelvis.x,width=id.startsWith('lie_')?.86:kind==='sofa'?.64:kind==='chair'?.36:.72;
  const back=(id==='recline'||id==='sit')&&['sofa','chair','wall'].includes(kind)?{x:person.mirror?Math.max(p[2].x,p[5].x)+.025:Math.min(p[2].x,p[5].x)-.025,yStart:Math.min(p[2].y,p[5].y)-.015,yEnd:plane}:undefined;
  person.supportRelation={...old,supportKind:kind,supportSurfaceId:`support:${kind}:${person.characterId}`,pelvisAnchor:pelvis,torsoAnchor:{...p[1]},contactPlaneY:plane,
    region:{xStart:cx-width/2,xEnd:cx+width/2,yStart:back?.yStart??plane-.10,yEnd:plane+.10},visibleEdge:{xStart:cx-width/2,xEnd:cx+width/2,y:plane},backEdge:back,
    status:kind==='unknown'?'manual_review_required':'planned',depthOrder:kind==='floor'?'under_actor':'behind_actor'};
  const warnings=kind==='unknown'?['基础姿态支持面未明确，当前仅控制身体骨架']:[];
  const supported=true;if(!supported)warnings.push('俯卧暂无对应基础模板，需要编辑骨骼或上传参考');person.basicGeometry={version:BASIC_GEOMETRY_VERSION,parameters:params,contacts:joints.map(j=>({joint:j,point:{...p[j]},surfaceOffset:plane-p[j].y})),supported,warnings};
}

export function rebuildBasicPeople(people:PosePoint[][],plans:PosePersonSemanticV3[]){return people.map((p,i)=>buildBasicGeometry(plans[i],p));}
