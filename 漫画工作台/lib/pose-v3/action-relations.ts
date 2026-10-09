import {resolveActionMechanism,mechanismGeometryFailures} from "../../scripts/action-mechanism.mjs";
import {actionStageState} from "../../scripts/action-stage-policy.mjs";
import type {PosePoint,PosePhase} from '../pose-v2';
import type {PosePersonSemanticV3,PoseRelationPlanV3} from './schema';
export type ActionGeometryInput=Omit<import('../../scripts/action-mechanism.mjs').MechanismGeometry,'mechanism'> & {mechanism?:'hinge'|'slide'|'press'|'rotate'|'work'|'mouth'|'transfer'|'force'|'support';mouthContact?:PosePoint};
export type ActionRelationAudit={version:'action-relations-1';phase:PosePhase;status:'planned'|'pending';contactState:'approach'|'contact'|'released';mechanism:string;errors:string[];stateBefore:string|null;stateAfter:string|null;handTargets:Array<{hand:'left'|'right';x:number;y:number}>;geometry?:ActionGeometryInput};
const dynamic=new Set(['open','close','operate_environment','write','tool','drink','eat','pick','place','push','pull']);
export function prepareActionRelationsV3(people:PosePoint[][],plans:PosePersonSemanticV3[],relations:PoseRelationPlanV3[]){
 for(const [i,person] of plans.entries()){
  person.actionRelationAudit=undefined;
  if(!person.relationTargets.length)continue;
  const canonicalId=person.relationTargets.find(r=>r.actionPlan&&dynamic.has(r.actionPlan.actionId))?.actionPlan?.actionId;
  if(!dynamic.has(person.templateId)&&!canonicalId)continue;
  if(!canonicalId&&!['pick','place','drink','eat'].includes(person.templateId)&&person.relationTargets.every(r=>!['operate'].includes(r.purpose)))continue;
  const id=dynamic.has(person.templateId)?person.templateId:canonicalId!;let g=person.actionGeometryInput;
  if(g?.modelVersion==='action-mechanism-1')g=resolveActionMechanism({...g,actionId:id},person.phase);
  const actionTargets=person.relationTargets.filter(r=>r.actionPlan?.actionId===id||(!r.actionPlan&&r.purpose==='operate')||(['pick','place','drink','eat'].includes(id)&&person.relationTargets.length===1));
  if(!actionTargets.length)continue;
  for(const r of person.relationTargets)r.actionRelationAudit=undefined;
  const phase=person.phase,errors:string[]=[];
  if(actionTargets.length>1)errors.push('多物体动作关系待定：需要分别指定操作对象与辅助持物，当前不能共享一组工作目标。');
  for(const key of ['axis','objectCenter','workPoint','toolEnd','mouthContact'] as const){const v=g?.[key];if(v&&(!Number.isFinite(v.x)||!Number.isFinite(v.y)))errors.push('动作目标包含无效坐标。');}
  if(g?.axis&&Math.hypot(g.axis.x,g.axis.y)<1e-6)errors.push('运动或施力方向不能为零。');
  if(g?.supportY!=null&&!Number.isFinite(g.supportY))errors.push('支持面高度无效。');
  if(actionTargets.length===1&&g?.objectCenter&&Number.isFinite(g.objectCenter.x)&&Number.isFinite(g.objectCenter.y))for(const relation of actionTargets){
   const old={...relation.target},dx=g.objectCenter.x-old.x,dy=g.objectCenter.y-old.y;
   relation.target={...g.objectCenter};person.target={...g.objectCenter};relation.contactAnchors=relation.contactAnchors?.map(a=>({...a,x:g?.gripPoint?g.gripPoint.x+(relation.handMode==='two'?(a.hand==='left'?.025:-.025):0):a.x+dx,y:g?.gripPoint?g.gripPoint.y:a.y+dy}));
   if(relation.gazeTarget.source!=='structured.external_object'&&(relation.gazeTarget.kind==='object'||relation.gazeTarget.kind==='work_point'))relation.gazeTarget={...relation.gazeTarget,point:g.workPoint||{...g.objectCenter}};
   if(person.gazeTarget.source!=='structured.external_object'&&(person.gazeTarget.kind==='object'||person.gazeTarget.kind==='work_point'))person.gazeTarget={...person.gazeTarget,point:g.workPoint||{...g.objectCenter}};
   const scene=relations.find(r=>r.relationId===relation.relationId);if(scene){scene.objectCenter={...g.objectCenter};scene.contactAnchors=relation.contactAnchors;if(scene.gazeTarget&&scene.gazeTarget.source!=='structured.external_object'&&(scene.gazeTarget.kind==='object'||scene.gazeTarget.kind==='work_point'))scene.gazeTarget={...scene.gazeTarget,point:g.workPoint||{...g.objectCenter}};}
  }
  const mechanism=['open','close'].includes(id)?g?.mechanism:['write','tool'].includes(id)?'work':['drink','eat'].includes(id)?'mouth':['pick','place'].includes(id)?'transfer':['push','pull'].includes(id)?'force':g?.mechanism;
  if(mechanism&&['open','close'].includes(id)&&!['hinge','slide'].includes(mechanism))errors.push('开合机构与动作不一致：开合需要铰链或滑动关系。');
  errors.push(...mechanismGeometryFailures(g));
  if(g?.modelVersion!=='action-mechanism-1'&&['hinge','rotate'].includes(mechanism||''))errors.push('旋转机构待定：二维骨架不能确定转轴、转角和物体状态，当前仅供预览。');
  if(g?.modelVersion!=='action-mechanism-1'&&['slide','press'].includes(mechanism||''))errors.push('机构行程待定：需要物体始末位置与开合或按压状态，当前仅供预览。');
  if(g?.modelVersion!=='action-mechanism-1'&&mechanism==='force'&&g?.axis)errors.push('施力支持链待定：方向已记录，但尚未建立手、重心与脚部的共同施力关系，仅供预览。');
  if(!mechanism)errors.push('动作机制待定：请指定铰链、滑动、按压或旋转。');
  if(['hinge','slide','press','rotate','force'].includes(mechanism||'')&&!g?.axis)errors.push('操作方向待定：请补充物体的运动或施力轴。');
  if(g?.modelVersion!=='action-mechanism-1'&&mechanism==='work'&&g?.workPoint&&g.toolEnd)errors.push('工具轮廓待定：当前工作点数据已保存，但工具作用端尚未贯通实际道具轮廓控制，仅供预览。');
  if(mechanism==='work'&&(!g?.workPoint||!g.toolEnd))errors.push('工具工作关系待定：需要工作端和工作面的接触点。');
  if(mechanism==='mouth'&&!g?.mouthContact)errors.push('饮食关系待定：需要杯沿、食物或餐具端的口部接触点。');
  if(mechanism==='transfer'&&!Number.isFinite(g?.supportY))errors.push('拿放支持面待定：请补充物体所在或落下的支持面高度。');
  if(mechanism==='mouth'&&g?.mouthContact){if(actionTargets.some(r=>Math.hypot(r.target.x-g.mouthContact!.x,r.target.y-g.mouthContact!.y)>.18))errors.push('口部接触点与所持物体脱离，不能伪造杯沿或餐具端。');const nose=people[i][0];if(Math.hypot(g.mouthContact.x-nose.x,g.mouthContact.y-(nose.y+.035))>.07&&phase==='contact')errors.push('杯沿或食物作用端没有接近口部，不能作为正在饮食。');}
  if(mechanism==='work'&&g?.workPoint&&g.toolEnd&&Math.hypot(g.workPoint.x-g.toolEnd.x,g.workPoint.y-g.toolEnd.y)>.025&&phase==='contact')errors.push('工具作用端没有接触工作面。');
  if(mechanism==='transfer'&&id==='pick'&&phase==='follow_through'&&g?.supportY!=null&&actionTargets.some(r=>r.target.y>=g.supportY!-.03))errors.push('拿取完成时物体尚未离开支持面，请调整物体目标位置。');
  if(mechanism==='transfer'&&g?.supportY!=null&&phase==='contact'&&id==='place'&&actionTargets.some(r=>Math.abs(r.target.y-g.supportY!)>.12))errors.push('放置目标没有到达声明支持面。');
  const audit:ActionRelationAudit={version:'action-relations-1',phase,status:errors.length?'pending':'planned',contactState:actionStageState(id,phase,relations.find(r=>r.relationId===actionTargets[0]?.relationId)?.supportState).contactState,mechanism:mechanism||'unknown',errors,stateBefore:g?.stateBefore||(id==='pick'?'on_support':id==='place'?'held':null),stateAfter:g?.stateAfter||(id==='pick'?'held':id==='place'?'on_support':null),handTargets:[],geometry:g};
  for(const relation of actionTargets){for(const a of relation.contactAnchors||[]){const s=people[i][a.hand==='left'?5:2];let target={...a};
   if(audit.contactState!=='contact'){const dx=s.x-a.x,dy=s.y-a.y,n=Math.hypot(dx,dy)||1;target={...a,x:a.x+dx/n*.04,y:a.y+dy/n*.04};}
   audit.handTargets.push(target);
  }
  relation.actionRelationAudit=audit;if(relation.actionPlan)relation.actionPlan={...relation.actionPlan,actionId:id,phase,geometry:g||{}};const scene=relations.find(r=>r.relationId===relation.relationId);if(scene){scene.actionRelationAudit=audit;if(scene.actionPlan)scene.actionPlan={...scene.actionPlan,actionId:id,phase,geometry:g||{}};scene.stateBefore=audit.stateBefore;scene.stateAfter=audit.stateAfter;}}
  person.actionRelationAudit=audit;person.actionGeometryInput=g;
 }
}
