import type { PosePoint } from '../pose-v2';
import type { ProjectionPlanV3, PoseRelationPlanV3 } from './schema';
import { renderControlOpenPoseV3 } from './render';
export const relationPreviewPoints=(relations:PoseRelationPlanV3[])=>relations.flatMap(r=>[r.objectCenter,...(r.contactAnchors||[]),...(r.actionRelationAudit?.geometry?.outline||[]).flatMap(o=>o.points)]);
export function fullPoseLayout(people:PosePoint[][],projection:ProjectionPlanV3|null,extraPoints:PosePoint[]=[]){
 const frame=projection?{x:(-.5-projection.translate.x)/projection.scale+.5,y:(-.5-projection.translate.y)/projection.scale+.5,width:1/projection.scale,height:1/projection.scale}:null;
 const points=[...people.flat(),...extraPoints].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
 const bounds=frame?[...points,{x:frame.x,y:frame.y},{x:frame.x+frame.width,y:frame.y+frame.height}]:points;
 const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x)),minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
 const scale=.86/Math.max(.1,maxX-minX,maxY-minY),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 const map=(p:PosePoint)=>({x:(p.x-cx)*scale+.5,y:(p.y-cy)*scale+.5});
 return {scale,cx,cy,people:people.map(p=>p.map(map)),frame:frame?{...map(frame),width:frame.width*scale,height:frame.height*scale}:null};
}
export function undoFullPoseLayout(people:PosePoint[][],layout:ReturnType<typeof fullPoseLayout>){return people.map(p=>p.map(q=>({x:(q.x-.5)/layout.scale+layout.cx,y:(q.y-.5)/layout.scale+layout.cy})));}
export function fullPosePreviewSvg(people:PosePoint[][],projection:ProjectionPlanV3|null,width:number,height:number,relations:PoseRelationPlanV3[]=[]){
 const extra=relationPreviewPoints(relations);
 const layout=fullPoseLayout(people,projection,extra),f=layout.frame;
 const map=(p:PosePoint)=>({x:((p.x-layout.cx)*layout.scale+.5)*width,y:((p.y-layout.cy)*layout.scale+.5)*height});
 const targets=relations.map(r=>{
   const center=map(r.objectCenter);
   const outlines=(r.actionRelationAudit?.geometry?.outline||[]).map(o=>`<polyline points="${o.points.map(p=>{const q=map(p);return `${q.x},${q.y}`;}).join(' ')}" fill="none" stroke="#94a3b8" stroke-width="2"/>`).join('');
   const grips=(r.contactAnchors||[]).map(a=>{const q=map(a),t=r.actionRelationAudit?.handTargets.find(t=>t.hand===a.hand),w=t?map(t):q;return `<line x1="${w.x}" y1="${w.y}" x2="${q.x}" y2="${q.y}" stroke="#ffffff" stroke-dasharray="3 3"/><circle cx="${q.x}" cy="${q.y}" r="5" fill="none" stroke="#ffffff" stroke-width="2"/>`;}).join('');
   return `<g data-preview-relation="true">${outlines}<path d="M ${center.x-5} ${center.y} h 10 M ${center.x} ${center.y-5} v 10" stroke="#94a3b8"/>${grips}</g>`;
 }).join('');
 const svg=renderControlOpenPoseV3(layout.people,layout.people.map(p=>p.map(()=> 'visible' as const)),width,height).replace('</svg>',`${targets}</svg>`);
 return svg.replace('</svg>',`${f?`<rect x="${f.x*width}" y="${f.y*height}" width="${f.width*width}" height="${f.height*height}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="2" stroke-dasharray="8 6"/>`:''}</svg>`);
}
