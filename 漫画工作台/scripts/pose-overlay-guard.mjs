import {mechanismGeometryFailures} from "./action-mechanism.mjs";
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
export function forearmsIntersect(p){return p?.length>=8 && cross(p[3],p[4],p[6])*cross(p[3],p[4],p[7]) < -1e-10 && cross(p[6],p[7],p[3])*cross(p[6],p[7],p[4]) < -1e-10;}
export function overlayGeometryFailures(people,plans){
 const failures=[];
 for(const [i,person] of (plans||[]).entries()){
   const audit=person.overlayAudit,p=people?.[i];
   if(person.templateId==='reach'){
    const hands=person.activeHand==='both'?['left','right']:[person.activeHand==='left'?'left':'right'];
    if(person.layers?.armTemplateId&&hands.some(h=>person.handMode==='two'||person.activeHand===h))failures.push(person.characterId+': 伸手与同一主动手的静态持物叠加冲突，请取消手部叠加或调整剧情动作');
    for(const h of hands){const s=p?.[h==='left'?5:2],w=p?.[h==='left'?7:4];if(s&&w&&person.relationTargets?.some(r=>['hold','carry','read'].includes(r.purpose)&&(r.handMode==='two'||r.activeHand===h))&&w.y-s.y>.18)failures.push(person.characterId+': 伸手目标与既有低位持物接触冲突，当前仅预览；请调整剧情目标或使用持物动作');}
   }
   if(person.templateId==='support_walk'&&!person.loadSupport)failures.push(person.characterId+': 搀扶承重关系待定：当前角色和肩部接触仅用于预览，尚未建立承重支持链');
   if(['open','close','operate_environment','write','tool','drink','eat','pick','place','push','pull'].includes(person.templateId)&&person.relationTargets?.length&&(['pick','place','drink','eat'].includes(person.templateId)||person.relationTargets.some(r=>r.purpose==='operate'))&&!person.actionRelationAudit)failures.push(person.characterId+': action contact contract missing; regenerate pose plan');
   if(person.actionRelationAudit?.version==='action-relations-1'){failures.push(...person.actionRelationAudit.errors);failures.push(...mechanismGeometryFailures(person.actionRelationAudit.geometry));const g=person.actionRelationAudit.geometry;if(g?.mouthContact&&person.actionRelationAudit.phase==='contact'&&p?.[0]&&distance(g.mouthContact,{x:p[0].x,y:p[0].y+.035})>.07)failures.push(person.characterId+': 杯沿或食物作用端没有接近口部');if(g?.workPoint&&g.toolEnd&&person.actionRelationAudit.phase==='contact'&&distance(g.workPoint,g.toolEnd)>.025)failures.push(person.characterId+': 工具作用端没有接触工作面');}
   if(person.actionRelationAudit?.mechanism==='force'&&person.actionRelationAudit.geometry?.modelVersion==='action-mechanism-1'&&!person.forceSupport)failures.push(person.characterId+': 施力支持链待定：当前身体支持类型尚未支持该施力模型');
   for(const support of [person.loadSupport,person.forceSupport].filter(Boolean))for(const c of support.footContacts||[]){if(!p?.[c.joint]||distance(p[c.joint],c.point)>.012)failures.push(person.characterId+': planted foot no longer matches support chain');}
   if(person.layers?.armSource==='manual'&&person.layers.armTemplateId&&person.actionRelationAudit?.geometry?.modelVersion==='action-mechanism-1')failures.push(person.characterId+': static arm overlay conflicts with the declared active object operation');
   if(person.loadSupport){
    const partner=plans.find(q=>q.characterId===person.loadSupport.partnerId);
    if(!partner?.loadSupport||partner.loadSupport.partnerId!==person.characterId||partner.loadSupport.role===person.loadSupport.role||partner.loadSupport.phase!==person.loadSupport.phase||partner.loadSupport.contactState!==person.loadSupport.contactState||Math.abs(partner.loadSupport.loadShare+person.loadSupport.loadShare-2)>1e-6)failures.push(person.characterId+': support partner/weight sharing contract inconsistent');
    if(person.loadSupport.phase!==person.phase||(person.loadSupport.phase==='anticipation'&&(person.loadSupport.contactState!=='approach'||person.loadSupport.loadShare!==1)))failures.push(person.characterId+': support stage/weight transfer inconsistent');
    const center=p&&{x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};if(center&&distance(center,person.loadSupport.pelvis)>.012||p?.[1]&&distance(p[1],person.loadSupport.torso)>.012)failures.push(person.characterId+': load support torso/pelvis no longer matches the stance');
    if(person.loadSupport.footContacts.length<(person.loadSupport.role==='active'?2:1))failures.push(person.characterId+': load support has no stable planted stance');
   }
   const requiredPurposes={drink:['drink'],place:['place'],open:['operate'],close:['operate'],operate_environment:['operate'],write:['operate'],tool:['operate'],push:['operate'],pull:['operate']};
   const purposes=requiredPurposes[person.templateId];
   if(person.source?.kind==='manual'&&purposes&&person.relationTargets?.length&&!person.relationTargets.some(r=>purposes.includes(r.purpose)))failures.push(person.characterId+': selected action conflicts with declared interaction purpose');
   if(person.source?.kind==='manual'&&person.templateId==='eat'&&person.relationTargets?.length&&!person.relationTargets.some(r=>/food|meal|bread|rice|fruit|snack|spoon|fork|chopsticks|utensil|食物|饭|面包|水果|勺|餐具|筷/i.test(r.object)))failures.push(person.characterId+': selected action conflicts with declared interaction purpose');
   if(person.source?.kind==='manual'&&p?.[0]&&person.relationTargets?.length&&person.gazeTarget?.kind==='object'&&person.gazeTarget.point){
     const dy=person.gazeTarget.point.y-p[0].y;
     if((person.templateId==='look_up'&&dy>.04)||(person.templateId==='nod'&&dy<-.04))failures.push(person.characterId+': selected head action conflicts with declared gaze target');
   }
   if(!audit){
     // Preserve historical coordinates, but reject stretched contact arms before replay.
     if(p?.length>=18 && person.relationTargets?.length){
       const hip={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};
       const upper=Math.max(.17,Math.min(.23,distance(p[1],hip)*.72)),fore=upper*.95;
       const hands=new Set(person.relationTargets.flatMap(r=>r.handMode==='two'||r.mode==='two_hands'?['left','right']:[r.activeHand==='left'?'left':'right']));
       for(const hand of hands){
         const [s,e,w]=hand==='left'?[5,6,7]:[2,3,4];
         if(distance(p[s],p[e])>upper+.04||distance(p[e],p[w])>fore+.04)failures.push(`${person.characterId}:${hand} legacy contact arm length invalid; regenerate pose plan`);
       }
     }
     continue;
   }
   failures.push(...audit.errors.filter(e=>!e.includes("contact target is beyond arm reach")));if(!p||p.length<18){failures.push(`${person.characterId}: overlay topology missing`);continue;}
   for(const a of audit.arms){
     const [s,e,w]=a.hand==='left'?[5,6,7]:[2,3,4];
     if(!Number.isFinite(a.upperLength)||!Number.isFinite(a.foreLength)||a.upperLength<=0||a.foreLength<=0){failures.push(`${person.characterId}: overlay bone lengths invalid`);continue;}
     if([p[s],p[e],p[w],a.target].some(q=>!q||!Number.isFinite(q.x)||!Number.isFinite(q.y))){failures.push(`${person.characterId}:${a.hand} overlay geometry non-finite`);continue;}
     const targetDistance=distance(p[s],a.target);
     if(targetDistance>a.upperLength+a.foreLength+1e-8||targetDistance<Math.abs(a.upperLength-a.foreLength)-1e-8)failures.push(`${person.characterId}:${a.hand} contact target is beyond arm reach`);
     if((audit.version==='pose-overlay-2'&&(Math.abs(distance(p[s],p[e])-a.upperLength)>.015||Math.abs(distance(p[e],p[w])-a.foreLength)>.015))||distance(p[s],p[e])>a.upperLength+.015||distance(p[e],p[w])>a.foreLength+.015)failures.push(`${person.characterId}:${a.hand} edited arm exceeds declared bone lengths`);
     if(a.source==='explicit_contact'&&distance(p[w],a.target)>.012)failures.push(`${person.characterId}:${a.hand} wrist no longer matches declared contact`);
   }
   if(audit.version==='pose-overlay-2'&&person.locomotion){for(const [h,k,a] of [[8,9,10],[11,12,13]])if(Math.abs(distance(p[h],p[k])-.20)>.015||Math.abs(distance(p[k],p[a])-.205)>.015)failures.push(`${person.characterId}: edited gait exceeds declared bone lengths`);}
   if(person.layers?.armTemplateId==='phone_two'&&forearmsIntersect(p)&&!/cross(?:ed|ing)?\s+(?:arms|forearms)|交叉.*(?:手|臂)/i.test(person.sourceText||''))failures.push(`${person.characterId}: ordinary phone overlay has crossed forearms`);
 }
 return [...new Set(failures)];
}
