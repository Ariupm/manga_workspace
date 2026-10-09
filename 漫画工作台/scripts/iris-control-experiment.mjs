// Experimental geometry only. Not enabled by production recipes. Inputs are
// detected normalized MediaPipe landmarks plus the owning actor's resolved gaze.
const MODES={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],'up-left':[-1,-1],'up-right':[1,-1],'down-left':[-1,1],'down-right':[1,1],neutral:[0,0]};
const EYES=[{iris:468,corners:[33,133],ring:[33,160,158,133,153,144]}, {iris:473,corners:[362,263],ring:[362,385,387,263,373,380]}];
export function planIrisControl({faces=[],region,nose,direction,gazeKind='target',eyes='open',width,height}){
 const skip=reason=>({status:'skipped',reason});
 if(eyes!=='open'||gazeKind==='camera'||gazeKind==='unknown')return skip('authored_gaze_preserved');
 if(!MODES[direction])return skip('unknown_direction');
 if(!region||![region.xStart,region.xEnd,width,height].every(Number.isFinite)||region.xStart<0||region.xEnd>1||region.xStart>=region.xEnd||width<=0||height<=0)return skip('invalid_geometry');
 const valid=f=>Array.isArray(f)&&f.length>=478&&f.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 const bounds=f=>({left:Math.min(...f.map(p=>p[0])),right:Math.max(...f.map(p=>p[0])),top:Math.min(...f.map(p=>p[1])),bottom:Math.max(...f.map(p=>p[1]))});
 const all=faces.map((f,index)=>valid(f)?{f,index,b:bounds(f)}:null).filter(Boolean);
 const matches=all.filter(({b,f})=>b.left>=region.xStart&&b.right<=region.xEnd&&(!nose||Math.hypot(f[1][0]-nose.x,f[1][1]-nose.y)<.25));
 if(matches.length!==1)return skip(matches.length?'ambiguous_actor':'face_not_localized');
 const {f,index,b}=matches[0];
 if(all.some(p=>p.index!==index&&p.b.left<b.right&&p.b.right>b.left&&p.b.top<b.bottom&&p.b.bottom>b.top))return skip('overlapping_faces');
 const toPixel=p=>({x:p[0]*width,y:p[1]*height});
 const planned=[];
 for(const eye of EYES){
  const corners=eye.corners.map(i=>toPixel(f[i])).sort((a,b)=>a.x-b.x),points=eye.ring.map(i=>toPixel(f[i]));
  const span=Math.hypot(corners[1].x-corners[0].x,corners[1].y-corners[0].y);
  if(span<10)return skip('eyes_too_small');
  const ux=(corners[1].x-corners[0].x)/span,uy=(corners[1].y-corners[0].y)/span,vx=-uy,vy=ux;
  const project=p=>({u:(p.x-corners[0].x)*ux+(p.y-corners[0].y)*uy,v:(p.x-corners[0].x)*vx+(p.y-corners[0].y)*vy});
  const local=points.map(project),minV=Math.min(...local.map(p=>p.v)),maxV=Math.max(...local.map(p=>p.v)),opening=maxV-minV;
  if(opening<2||opening/span<.08||opening/span>.8)return skip('eye_occluded_or_unreliable');
  const [dx,dy]=MODES[direction],u=span*(.5+dx*.2),v=(minV+maxV)/2+dy*opening*.22;
  const pupil={x:corners[0].x+u*ux+v*vx,y:corners[0].y+u*uy+v*vy};
  const original=toPixel(f[eye.iris]);
  const cx=corners[0].x+span*.5*ux+(minV+maxV)/2*vx,cy=corners[0].y+span*.5*uy+(minV+maxV)/2*vy;
  planned.push({irisIndex:eye.iris,original,target:pupil,normalizedTarget:{x:pupil.x/width,y:pupil.y/height},mask:{cx,cy,rx:span*.65,ry:Math.max(opening*.85,span*.16),angle:Math.atan2(uy,ux)*180/Math.PI},span,opening});
 }
 return {status:'prepared',faceIndex:index,faceBounds:b,region,direction,eyes:planned,semanticStatus:'unverified',coordinateSpace:'image_pixels'};
}

export function irisMaskSvg(plan,width,height){
 if(plan.status!=='prepared')throw new Error('No reliable eye geometry');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><clipPath id="actor"><rect x="${plan.region.xStart*width}" y="0" width="${(plan.region.xEnd-plan.region.xStart)*width}" height="${height}"/></clipPath></defs><rect width="100%" height="100%" fill="black"/><g clip-path="url(#actor)">${plan.eyes.map(e=>{const m=e.mask;return `<ellipse cx="${m.cx}" cy="${m.cy}" rx="${m.rx}" ry="${m.ry}" transform="rotate(${m.angle} ${m.cx} ${m.cy})" fill="white"/>`;}).join('')}</g></svg>`;
}
