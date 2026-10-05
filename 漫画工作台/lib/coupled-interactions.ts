import {inferExplicitWorkTarget} from './interaction-facts';
import type {InteractionContract} from './prompts';
import {resolveActionMechanism} from '../scripts/action-mechanism.mjs';

/** Work binding is independent of gaze; legacy inference needs an explicit operation noun. */
export function bindWorkInteractions(input:InteractionContract[]):InteractionContract[]{
 const result=structuredClone(input);
 for(const tool of result){
  if(!['tool','write'].includes(tool.actionPlan?.actionId||''))continue;
  let binding=tool.visualFacts?.workTarget;
  if(!binding&&tool.visualFacts){
   binding=inferExplicitWorkTarget(tool.visualFacts,tool.actionPlan?.evidence||'',result.filter(r=>r.characterId===tool.characterId&&r.visualFacts).map(r=>r.visualFacts!));
   if(binding){tool.visualFacts.workTarget=binding;tool.visualFacts.provenance.workTarget={source:'legacy_default',evidence:'Unique explicitly named work object in action: '+tool.actionPlan?.evidence};}
  }
  if(!binding)continue;
  const target=result.find(r=>r.objectInstanceId===binding!.instanceId&&r.characterId===tool.characterId);
  if(!target)throw new Error('工具工作目标没有对应当前人物的交互实例');
  if((target.expectedCount||1)!==1||(tool.expectedCount||1)!==1)throw new Error('工具操作需要独立单件工作实例');
  if(target.contactAnchors.some(a=>tool.contactAnchors.some(b=>a.hand===b.hand)))throw new Error('工具与被操作物体不能占用同一只手');
  const solid=target.visualFacts?.object.form==='solid_box'||/\b(?:package|parcel|box|carton)\b/i.test(target.object);
  const width=target.visualFacts?.object.width||.16,height=target.visualFacts?.object.height||(solid?.10:.04);
  const center={x:(target.region.xStart+target.region.xEnd)/2,y:target.supportLabel?.match(/desk|table|counter/i)?.length?.44:target.objectCenter.y};
  const left=center.x-width/2,right=center.x+width/2,top=center.y-height/2,bottom=center.y+height/2;
  const work={x:left+binding.u*width,y:top+binding.v*height};
  if(target.visualFacts?.provenance.phase?.source==='manual'&&target.visualFacts.actionId!=='touch')throw new Error('人工目标动作与工具辅助稳定关系冲突');
  tool.workTargetLabel=target.object;
  target.objectCenter=center;
  target.contactAnchors=target.contactAnchors.map(a=>({...a,x:a.hand==='left'?right:left,y:top+height*.25,role:'support'}));
  const geometry=resolveActionMechanism({modelVersion:'action-mechanism-1' as const,actionId:'touch',phase:target.visualFacts?.phase||'contact',mechanism:'support' as const,controlShape:'box' as const,objectForm:solid?'solid_box' as const:'flat' as const,baseCenter:center,objectCenter:center,gripPoint:target.contactAnchors[0],extent:{width,height},supportY:target.visualFacts?.support.state==='on_support'?bottom:undefined,source:'coupled_work_layout',assumptions:['representative object dimensions; work surface coordinates shared with tool']},target.visualFacts?.phase||'contact');
  // The target is stabilized during this operation, not independently opened.
  target.actionPlan={version:'story-action-1',actionId:'touch',phase:target.visualFacts?.phase||'contact',geometry,source:'confirmed_interaction',evidence:'stabilizing the '+target.object,assumptions:geometry.assumptions};
  if(target.visualFacts){
   if(target.visualFacts.actionId!=='touch'){target.visualFacts.actionId='touch';target.visualFacts.provenance.phase={source:'model',evidence:'Assisting contact within work binding '+tool.objectInstanceId};}
   if(target.visualFacts.provenance.contact?.source!=='manual'&&binding.surface==='sealing tape'){
    target.visualFacts.contact.part='top panel';target.visualFacts.provenance.contact={source:'model',evidence:'Stabilizing target of sealing-tape operation'};
   }
  }
  target.purpose='inspect';
  const hand=tool.activeHand==='left'?'left':'right';
  const grip={x:work.x+(hand==='left'?.065:-.065),y:work.y-.025};
  const g=resolveActionMechanism({...tool.actionPlan!.geometry,baseCenter:grip,workPoint:work,toolEndLocked:false,workTargetId:target.objectInstanceId,workTargetSurface:binding.surface,source:'coupled_work_layout'},tool.actionPlan!.phase);
  // The target supplies the surface; a second independent surface would duplicate it.
  g.outline=g.outline?.filter(p=>p.role!=='work_surface');
  tool.actionPlan={...tool.actionPlan!,geometry:g};tool.objectCenter=g.objectCenter!;
  tool.contactAnchors=tool.contactAnchors.map(a=>({...a,...grip}));
  for(const relation of result)if(relation.visualFacts?.gaze.kind==='object'&&relation.visualFacts.gaze.targetId===target.objectInstanceId&&relation.visualFacts.provenance.gaze?.source!=='manual'){
   relation.gazeTarget={...relation.gazeTarget,kind:'object',point:work,targetId:target.objectInstanceId,source:'structured.external_object'};
   relation.gaze='eyes focused on the '+target.object+' '+binding.surface;
   relation.visualFacts.gaze.surface=binding.surface;relation.visualFacts.gaze.description=relation.gaze;
   relation.visualFacts.provenance.gaze={source:'model',evidence:'Existing object gaze resolved to bound work surface'};
  }
 }
 return result;
}
