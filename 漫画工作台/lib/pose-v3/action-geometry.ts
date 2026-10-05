import {orientHeadV3} from "./head-geometry";
import {ARM_RIG_V3} from "./rig";
import type {PosePoint} from '../pose-v2';
import type {PosePersonSemanticV3} from './schema';
import {solveArmChain} from './contact-geometry';
const rotate=(p:PosePoint,c:PosePoint,a:number)=>({x:c.x+(p.x-c.x)*Math.cos(a)-(p.y-c.y)*Math.sin(a),y:c.y+(p.x-c.x)*Math.sin(a)+(p.y-c.y)*Math.cos(a)});
/** Builds action intent before the shared arm/contact solver and camera projection. */
export function actionGeometryV3(input:PosePoint[][],plans:PosePersonSemanticV3[]){
 const people=input.map(p=>p.map(q=>({...q})));
 plans.forEach((plan,i)=>{
  const p=people[i],id=plan.templateId;plan.actionContacts=[];
  if(id==='walk_together'){plan.primaryAction='locomotion';plan.locomotion={mode:'walk',gaitPhase:plan.phase==='anticipation'?'heel_strike':plan.phase==='follow_through'?'toe_off':'mid_stance',leadSide:'right',supportSide:'left',swingSide:'right',stride:.16,torsoLean:.02,armSwing:.1,lowerBodyControl:'full'};}
  const hip={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};
  const phase=plan.phase==='anticipation'?0:plan.phase==='follow_through'?2:1;
  const intensity=plan.intensity==='dynamic'?1.1:plan.intensity==='calm'?.85:1;
  const direction=(plan.facing==='left'?-1:1)*(plan.mirror?-1:1);
  const upper=[0,1,2,3,4,5,6,7,14,15,16,17];
  const leaning=id==='bend'?.65:id==='pick'?(phase===2?.08:.35):id==='place'?(phase===0?.06:.28):id==='push'?.18:id==='pull'?-.18:0;
  const force=plan.actionGeometryInput?.modelVersion==='action-mechanism-1'&&plan.actionGeometryInput.mechanism==='force'?plan.actionGeometryInput:null;
  plan.forceSupport=undefined;
  if(force?.axis&&plan.basePose==='standing'&&!((force.gripPoint?.y||0)>.64&&/straight legs|locked knees|膝盖伸直|直腿/i.test(plan.sourceText))){
   const drop=Math.max(0,(force.gripPoint?.y||0)-.52);if(drop){for(const j of [...upper,8,11])p[j].y+=drop;hip.y+=drop;}
   const n=Math.hypot(force.axis.x,force.axis.y)||1,axis={x:force.axis.x/n,y:force.axis.y/n};
   const sign=id==='pull'||force.actionId==='pull'?-1:1;
   const exertion=plan.phase==='anticipation'?0:1;const lean={x:axis.x*.045*sign*exertion,y:axis.y*.025*sign*exertion};
   for(const j of upper){const amount=(hip.y-p[j].y)/Math.max(.1,hip.y-p[1].y);p[j]={x:p[j].x+lean.x*amount,y:p[j].y+lean.y*amount};}
   const footContacts=[];
   for(const [h,k,a,side] of [[8,9,10,-1],[11,12,13,1]]){
    const foot={x:hip.x+side*(plan.mirror?-1:1)*.11-axis.x*.02*sign,y:.90};
    const solved=solveArmChain(p[h],foot,.20,.205,{x:p[h].x+side*(plan.mirror?-1:1)*.07,y:p[h].y+.17});p[k]=solved.elbow;p[a]=solved.wrist;footContacts.push({joint:a,point:{...p[a]}});
   }
   if(plan.basicGeometry)plan.basicGeometry.contacts=plan.basicGeometry.contacts.filter(c=>![10,13].includes(c.joint)).concat(footContacts.map(c=>({...c,surfaceOffset:0})));
   plan.forceSupport={version:'force-support-1',axis,lean,footContacts};plan.supportRelation={...plan.supportRelation,torsoAnchor:{...p[1]},pelvisAnchor:{...hip},contactPlaneY:.90,visibleEdge:{...plan.supportRelation.visibleEdge,y:.90}};
  }
  if(leaning&&!force){
   const view=plan.basicGeometry?.parameters.view||'three_quarter';
   const forward=(view==='left_profile'?-1:view==='right_profile'?1:view==='front'?0:(plan.facing==='left'?-1:1))*(plan.mirror?-1:1);
   for(const j of upper){const dy=hip.y-p[j].y;p[j]={x:p[j].x+dy*Math.sin(leaning*intensity)*forward,y:hip.y-dy*Math.cos(leaning*intensity)+dy*Math.sin(leaning*intensity)*.12};}
  }
  if(id==='turn'){for(const j of upper)p[j].x=hip.x+(p[j].x-hip.x)*.58;p[0].x+=direction*.035;for(const j of [14,15,16,17])p[j].x+=direction*.035;}
  if(['nod','look_up','head_turn','head_tilt'].includes(id)){
   const old={...p[0]};orientHeadV3(p,id==='nod'?.45*(phase+1)/2:id==='look_up'?-.55:0,id==='head_turn'?.75:0,id==='head_tilt'?.30*direction:0,plan.mirror);
   plan.headDirection={...plan.headDirection,dx:p[0].x-old.x,dy:p[0].y-old.y,mode:id==='look_up'?'up':id==='nod'?'down':direction<0?'left':'right'};
  }
  if(plan.primaryAction==='locomotion'&&plan.locomotion){
   const gait=plan.locomotion,running=gait.mode==='run',support=gait.supportSide==='right'?0:1;
   const lean=gait.torsoLean*direction;for(const j of upper)p[j].x+=lean*(hip.y-p[j].y)/Math.max(.1,hip.y-p[1].y);
   const step=gait.gaitPhase==='heel_strike'?0:gait.gaitPhase==='mid_stance'?1:2;
   for(const [side,h,k,a] of [[0,8,9,10],[1,11,12,13]]){
    const grounded=side===support;
    const foot={x:p[h].x+direction*(grounded?-.025:(running?.17:.12)),y:grounded?.90:.90-(running?.13:.045)-(step===2?.035:0)};
    const solved=solveArmChain(p[h],foot,.20,.205,{x:p[h].x+direction*.15,y:p[h].y+.12});p[k]=solved.elbow;p[a]=solved.wrist;
   }
   for(const [hand,s,e,w,side] of [['right',2,3,4,0],['left',5,6,7,1]] as const){if(plan.relationTargets.some(r=>r.handMode==='two'||r.activeHand===hand))continue;const sign=side===support?1:-1;const angle=direction*sign*(running?.7:.32)*(step===1?.6:1);p[e]={x:p[s].x+ARM_RIG_V3.upper*Math.sin(angle),y:p[s].y+ARM_RIG_V3.upper*Math.cos(angle)};const foreAngle=direction*sign*(running?2.1:.6);p[w]={x:p[e].x+ARM_RIG_V3.fore*Math.sin(foreAngle),y:p[e].y+ARM_RIG_V3.fore*Math.cos(foreAngle)};}
   plan.supportRelation={...plan.supportRelation,pelvisAnchor:hip,torsoAnchor:{...p[1]},contactPlaneY:.92,visibleEdge:{...plan.supportRelation.visibleEdge,y:.92}};
  }
  const hands=plan.handedness==='both'?['right','left'] as const:[plan.activeHand==='left'?'left':'right'] as const;
  const moving=['point','reach','self_touch','pick','place','push','pull','open','close','operate_environment','write','tool','drink','eat'];
  if(id==='reaction'){const w=plan.activeHand==='left'?7:4;p[w]={x:p[0].x+(w===7?.045:-.045),y:p[0].y+.055};}
  if(id==='conversation'||id==='confrontation'){for(const [s,w] of [[2,4],[5,7]])p[w]={x:p[s].x+(id==='confrontation'?direction*.15:0),y:p[s].y+(id==='confrontation'?.18:.34)};}
  if(moving.includes(id)&&!plan.layers?.armTemplateId){
   for(const hand of (['push','pull'].includes(id)?['right','left'] as const:hands)){
    // Declared object/work contacts remain authoritative and are solved later.
    if(plan.relationTargets.some(r=>r.handMode==='two'||r.activeHand===hand))continue;
    const shoulder=p[hand==='left'?5:2],w=hand==='left'?7:4;
    let target={x:shoulder.x+direction*(id==='point'?.30:.23)*intensity,y:shoulder.y+.055+(phase===0?.055:0)};
    if(['pick','place','write','tool'].includes(id))target={x:shoulder.x+direction*(id==='place'?.14:.10),y:shoulder.y+.23-(phase===2&&id==='pick'?.10:0)};
    if(id==='pull')target={x:shoulder.x+direction*.10,y:shoulder.y+.16};
    if(id==='open'||id==='close')target={x:shoulder.x+direction*(id==='open'?.12:.26),y:shoulder.y+.10+(phase-1)*.035};
    if(id==='self_touch')target={x:p[0].x+(hand==='left'?.035:-.035)*(plan.mirror?-1:1),y:p[0].y+.02};
    if(id==='drink'||id==='eat')target={x:p[0].x+(hand==='left'?.025:-.025)*(plan.mirror?-1:1),y:p[0].y+(phase===0?.11:id==='drink'?.025:.045)};
    if(plan.target&&plan.gazeTarget.source==='pose_override.target_direction'&&['point','reach','open','close','operate_environment'].includes(id))target={...plan.target};
    p[w]=target;
   }
  }
  if(leaning||id==='turn')plan.supportRelation={...plan.supportRelation,torsoAnchor:{...p[1]}};
 });
 if(people.length===2){
  const id=plans[0].templateId;
  if(id==='guide_pull'||id==='support_walk'){
   const declaredRoles=plans.some(p=>p.pairRole)||plans.some(p=>p.source.kind==='manual');
   plans.forEach((plan,i)=>{const leader=plan.pairRole?plan.pairRole==='active':i===0;plan.pairRole=leader?'active':'supported';
    plan.loadSupport=undefined;
    const shift=id==='guide_pull'?(leader?.035:-.025):(leader?0:.035);
    for(const j of [0,1,2,3,4,5,6,7,14,15,16,17]){people[i][j].x+=id==='guide_pull'?shift:0;people[i][j].y+=id==='support_walk'?shift:0;}
    if(id==='support_walk'&&declaredRoles&&plan.basePose==='standing'){
     const p=people[i],toward=Math.sign(people[1-i][1].x-p[1].x)||1,carrying=plan.phase!=='anticipation';
     const dx=carrying?toward*(leader?.025:.045):0;
     for(const j of [8,11])p[j].x+=dx;
     for(const j of [0,1,2,3,4,5,6,7,14,15,16,17])p[j].x+=carrying?toward*(leader?.035:.075):0;
     const center={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2},footContacts=[];
     for(const [h,k,a,side] of [[8,9,10,-1],[11,12,13,1]]){
      const worldSide=side*(plan.mirror?-1:1),planted=!carrying||leader||worldSide===-toward;
      const foot={x:center.x+worldSide*(leader?.11:.065),y:planted?.90:.855};
      const solved=solveArmChain(p[h],foot,.20,.205,{x:p[h].x+side*(plan.mirror?-1:1)*.07,y:p[h].y+.17});p[k]=solved.elbow;p[a]=solved.wrist;
      if(planted)footContacts.push({joint:a,point:{...p[a]}});
     }
     if(plan.basicGeometry)plan.basicGeometry.contacts=plan.basicGeometry.contacts.filter(c=>![10,13].includes(c.joint)).concat(footContacts.map(c=>({...c,surfaceOffset:0})));
     plan.loadSupport={version:'load-support-1',role:leader?'active':'supported',partnerId:plans[1-i].characterId,phase:plan.phase,contactState:carrying?'contact':'approach',loadShare:carrying?(leader?1.2:.8):1,pelvis:center,torso:{...p[1]},footContacts,source:plan.source.kind==='manual'?'manual':'story',assumptions:['representative 20 percent load-sharing stance; no measured body mass']};
     plan.supportRelation={...plan.supportRelation,pelvisAnchor:center,torsoAnchor:{...p[1]},contactPlaneY:.90,visibleEdge:{...plan.supportRelation.visibleEdge,y:.90},status:'planned'};
    }else if(id==='support_walk')plan.supportRelation.status='manual_review_required';
    plan.supportRelation.torsoAnchor={...people[i][1]};
   });
  }
  if(['handover','handshake','highfive','embrace','support_walk','shared_prop','guide_pull'].includes(id)){
   const order=people[0][1].x<=people[1][1].x?[0,1]:[1,0],mid=(people[0][1].x+people[1][1].x)/2;
   for(const i of order){const other=1-i,p=people[i],q=people[other],plan=plans[i];
    const inner: 'left'|'right'=p[5].x>p[2].x?(p[1].x<q[1].x?'left':'right'):(p[1].x<q[1].x?'right':'left');
    const handList=id==='embrace'?['right','left'] as const:[inner];
    for(const hand of handList){if(plan.relationTargets.some(r=>r.handMode==='two'||r.activeHand===hand))continue;
     const nearShoulder=Math.abs(q[2].x-p[1].x)<Math.abs(q[5].x-p[1].x)?q[2]:q[5];
     const separated=plan.phase==='anticipation'?(p[1].x<q[1].x?-.035:.035):0;
     const target=id==='embrace'?{x:nearShoulder.x,y:nearShoulder.y+(hand===inner?.09:.16)}:id==='support_walk'?{x:nearShoulder.x+separated,y:nearShoulder.y+.025}:{x:mid+(['handover','shared_prop'].includes(id)?(p[1].x<q[1].x?-.025:.025):separated),y:id==='highfive'?.25:id==='guide_pull'?.43:.48};
     plan.actionContacts!.push({hand,target,relationId:`pair:${id}:${i}:${hand}`});
    }
    plan.handMode=handList.length===2?'two':'one';plan.activeHand=handList.length===2?'both':inner;plan.handedness=plan.activeHand;
   }
  }
 }
 return people;
}
