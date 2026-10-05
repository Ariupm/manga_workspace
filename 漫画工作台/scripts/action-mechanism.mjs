const add=(a,b,k=1)=>({x:a.x+b.x*k,y:a.y+b.y*k});
const unit=a=>{const n=Math.hypot(a.x,a.y)||1;return{x:a.x/n,y:a.y/n};};
const rect=(c,w,h)=>[{x:c.x-w/2,y:c.y-h/2},{x:c.x+w/2,y:c.y-h/2},{x:c.x+w/2,y:c.y+h/2},{x:c.x-w/2,y:c.y+h/2}];
const path=(points,role='body',closed=true)=>({points,role,closed});
const circle=(c,r)=>Array.from({length:16},(_,i)=>({x:c.x+Math.cos(i*Math.PI/8)*r,y:c.y+Math.sin(i*Math.PI/8)*r}));
/** Parametric source-space geometry. Defaults are an auditable staging assumption, not measured physics. */
export function resolveActionMechanism(input,phase='contact'){
 if(input?.modelVersion!=='action-mechanism-1')return input;
 const g=structuredClone(input),c=g.baseCenter,axis=unit(g.axis||{x:1,y:0});
 if(!c)return g;
 const t=phase==='anticipation'?0:phase==='follow_through'?1:.55;
 const amount=g.actionId==='close'?1-t:t;
 const w=g.extent?.width||.12,h=g.extent?.height||.12;
 let center={...c},grip={...c},outline=[];
 if(g.mechanism==='hinge'){
  const pivot=g.pivot||{x:c.x-w/2,y:c.y};
  const span=(g.hingeSide==='right'?-1:1)*w*Math.cos(amount*(g.angle||1));
  const edge={x:pivot.x+span,y:pivot.y};
  center={x:(pivot.x+edge.x)/2,y:pivot.y};grip={x:pivot.x+span*.88,y:pivot.y};
  outline=[path([{x:pivot.x,y:pivot.y-h/2},{x:edge.x,y:edge.y-h/2},{x:edge.x,y:edge.y+h/2},{x:pivot.x,y:pivot.y+h/2}])];
  g.pivot=pivot;g.depthAssumption='vertical_hinge_projected_width';
 }else if(['slide','press'].includes(g.mechanism)){
  center=add(c,axis,(g.travel||.04)*amount);grip={...center};
  outline=[path(g.controlShape==='button'?circle(center,w/2):rect(center,w,h))];
 }else if(g.mechanism==='rotate'){
  const a=amount*(g.angle||Math.PI/2),r=w/2;
  grip={x:c.x+Math.cos(a)*r*.75,y:c.y+Math.sin(a)*r*.75};
  outline=[path(circle(c,r)),path([c,grip],'working_edge',false)];
 }else if(g.mechanism==='work'){
  const work=g.workPoint||add(c,axis,.06),end=g.toolEndLocked&&g.toolEnd?g.toolEnd:phase==='anticipation'?add(work,axis,-.025):{...work};
  g.workPoint=work;g.toolEnd=end;grip={...c};
  const dir=unit({x:end.x-c.x,y:end.y-c.y}),normal={x:-dir.y,y:dir.x};
  if(g.controlShape==='keyboard'){
   center={...work};grip={...work};outline=[path(rect(center,w,h)),...[-1,0,1].map(k=>path([{x:center.x-w*.4,y:center.y+k*h*.2},{x:center.x+w*.4,y:center.y+k*h*.2}],'working_edge',false))];
  }else if(['scissors','pliers'].includes(g.controlShape)){
   const opening=phase==='anticipation'?.018:phase==='follow_through'?.004:.01;
   const back=add(c,dir,-.045);
   outline=[path([add(back,normal,-.01),c,add(end,normal,opening)],'working_edge',false),path([add(back,normal,.01),c,add(end,normal,-opening)],'working_edge',false)];
   center={x:(back.x+end.x)/2,y:(back.y+end.y)/2};
  }else if(g.controlShape==='hammer'){
   const back=add(c,dir,-.045),head=add(end,dir,-.008);
   outline=[path([back,c,head],'body',false),path([add(add(head,normal,-.022),dir,-.008),add(add(head,normal,.022),dir,-.008),add(end,normal,.022),add(end,normal,-.022)])];
   center={x:(back.x+end.x)/2,y:(back.y+end.y)/2};
  }else if(g.controlShape==='wrench'){
   const back=add(c,dir,-.045),jaw=add(end,dir,-.02);
   outline=[path([back,c,jaw],'body',false),path([end,add(end,normal,.02),add(jaw,normal,.02),add(jaw,normal,-.01),add(end,normal,-.01)],'working_edge',false)];
   center={x:(back.x+end.x)/2,y:(back.y+end.y)/2};
  }else{
   const back=add(c,dir,-.045),thickness=g.controlShape==='knife'?.012:.004;
   outline=[path([add(back,normal,thickness),add(end,normal,thickness),end,add(back,normal,-thickness)])];
   center={x:(back.x+end.x)/2,y:(back.y+end.y)/2};
  }
  if(g.controlShape!=='keyboard')outline.push(path([{x:work.x-.065,y:work.y+.005},{x:work.x+.065,y:work.y+.005}],'work_surface',false));
 }else if(g.mechanism==='force'){
  outline=[path(rect(c,w,h))];grip=add(c,axis,-w*.35);grip.y-=h*.35;
  if(g.supportY!=null)outline.push(path([{x:c.x-w*.7,y:g.supportY},{x:c.x+w*.7,y:g.supportY}],'work_surface',false));
 }else if(g.mechanism==='transfer'){
  const support=g.supportY??c.y;
  const lifted={x:c.x,y:support-.10};
  center=g.actionId==='place'?(phase==='anticipation'?lifted:{x:c.x,y:support}):(phase==='follow_through'?lifted:{x:c.x,y:support});
  grip={...center};
  const count=g.objectCount??1;
  if(!Number.isInteger(count)||count<1||count>16){g.outline=[];return g;}
  // Multiple items are one authored group footprint, with distinct silhouettes;
  // no second translation/projection and no multiplication of hand anchors.
  outline=Array.from({length:count},(_,i)=>path(rect({x:center.x+(i-(count-1)/2)*w/count,y:center.y},w/count*(count===1?1:.9),h),'body'));
 }
 if(['open','close'].includes(g.actionId)){g.stateBefore=g.actionId==='open'?'closed':'open';g.stateAfter=g.actionId==='open'?'open':'closed';}
 g.phase=phase;g.progress=amount;g.objectCenter=center;g.gripPoint=grip;g.outline=outline;
 return g;
}
export function actionOutlineBounds(geometry){
 const points=geometry?.outline?.flatMap(p=>p.points)||[];
 if(!points.length)return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 return{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}

/** Multiple portable items share one footprint; contacts still belong to the actor. */
export function propGroupOutline(relation,center,width,height){
 const count=relation?.expectedCount||1;
 if(count===1)return null;
 if(!Number.isInteger(count)||count<1||count>16)throw new Error('Unsupported prop group count');
 const itemWidth=width/count*.9;
 return {outline:Array.from({length:count},(_,i)=>{
  const c={x:center.x+(i-(count-1)/2)*width/count,y:center.y};
  return path(relation.shape==='dish'?circle(c,Math.min(itemWidth,height)/2):rect(c,itemWidth,height));
 })};
}
export function relocateActionGeometry(g,target){
 if(g?.modelVersion!=='action-mechanism-1'||!g.objectCenter)return {...g,objectCenter:target};
 const dx=target.x-g.objectCenter.x,dy=target.y-g.objectCenter.y;
 const result=structuredClone(g);
 for(const key of ['baseCenter','pivot','gripPoint','objectCenter','workPoint','toolEnd'])if(result[key])result[key]={x:result[key].x+dx,y:result[key].y+dy};
 result.outline=result.outline?.map(p=>({...p,points:p.points.map(q=>({x:q.x+dx,y:q.y+dy}))}));
 if(result.supportY!=null)result.supportY+=dy;
 return result;
}
export function actionOutlineMarkup(geometry,width,height){
 return (geometry?.outline||[]).map(p=>`<path d="${p.points.map((q,i)=>`${i?'L':'M'} ${q.x*width} ${q.y*height}`).join(' ')}${p.closed?' Z':''}"/>`).join('');
}
export function mechanismGeometryFailures(g){
 if(g?.modelVersion!=='action-mechanism-1')return [];
 const errors=[];
 if(g.objectCount!=null&&(!Number.isInteger(g.objectCount)||g.objectCount<1||g.objectCount>16))errors.push('道具组数量必须在1到16之间');
 const points=[g.baseCenter,g.objectCenter,g.gripPoint,g.axis,g.pivot,g.workPoint,g.toolEnd,...(g.outline||[]).flatMap(p=>p.points)].filter(Boolean);
 if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))errors.push('动作机构包含无效坐标');
 if(!g.outline?.length)errors.push('动作机构没有执行轮廓');
 if(g.axis&&Math.hypot(g.axis.x,g.axis.y)<1e-6)errors.push('动作机构运动轴为零');
 if(g.travel!=null&&(!Number.isFinite(g.travel)||g.travel<0||g.travel>.3))errors.push('机构行程超出支持范围');
 if(g.extent&&(!Number.isFinite(g.extent.width)||!Number.isFinite(g.extent.height)||g.extent.width<=0||g.extent.height<=0))errors.push('物体机构尺寸无效');
 if(g.angle!=null&&(!Number.isFinite(g.angle)||Math.abs(g.angle)>Math.PI))errors.push('机构转角超出支持范围');
 if(g.mechanism==='work'&&g.phase!=='anticipation'&&g.workPoint&&g.toolEnd&&Math.hypot(g.workPoint.x-g.toolEnd.x,g.workPoint.y-g.toolEnd.y)>.025)errors.push('工具作用端未接触工作面');
 const compatible={hinge:['panel'],slide:['panel'],press:['button'],rotate:['knob'],work:['pen','pencil','brush','scissors','knife','keyboard','hammer','wrench','screwdriver','pliers'],force:['box','panel'],transfer:['box']};
 if(!compatible[g.mechanism]?.includes(g.controlShape))errors.push('动作机构与执行轮廓类型不一致');
 if(!errors.length){
  const expected=resolveActionMechanism(g,g.phase);
  if(JSON.stringify(expected.outline)!==JSON.stringify(g.outline)||Math.hypot(expected.objectCenter.x-g.objectCenter.x,expected.objectCenter.y-g.objectCenter.y)>1e-8||Math.hypot(expected.gripPoint.x-g.gripPoint.x,expected.gripPoint.y-g.gripPoint.y)>1e-8)errors.push('动作机构快照与声明参数不一致');
 }
 return errors;
}
export function mechanismPromptTerms(g){
 if(g?.modelVersion!=='action-mechanism-1')return [];
 const staged=g.phase==='anticipation'?'before contact':g.phase==='follow_through'?'completed action':'action in progress';
 const terms={hinge:'panel opening or closing around its fixed vertical hinge; preserve the pivot edge',slide:'panel sliding along its track',press:'acting fingertip pressing the fixed button',rotate:'hand turning the knob around its fixed center',work:g.phase==='anticipation'?'tool working end approaching the work surface without contact':'tool working end contacting the work surface',force:'hand force aligned with a stable planted-foot stance',transfer:g.actionId==='place'&&g.phase==='follow_through'?'object on support, hands released':'object position consistent with its support and transfer stage'};
 const approach={hinge:'panel at its initial hinge angle, handle not yet contacted',slide:'panel at the start of its track, handle not yet contacted',press:'button remains unpressed before fingertip contact',rotate:'knob remains at its initial angle before finger contact',force:'object at rest, feet planted before force is applied'};
 return [g.phase==='anticipation'?(approach[g.mechanism]||terms[g.mechanism]):terms[g.mechanism],staged].filter(Boolean);
}
