import { openPoseColors as colors, openPoseLimbs, type PosePoint } from "../pose-v2";
import type { VisibilityV3 } from "./schema";

/** Clip continuous limbs at the viewport, rather than deleting a limb whose end is outside. */
export function renderControlOpenPoseV3(people:PosePoint[][],visibility:VisibilityV3[][],width:number,height:number){
 const parts=people.flatMap((p,pi)=>{
  const drawable=(i:number)=>["visible","out_of_frame"].includes(visibility[pi]?.[i])&&p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y);
  return [
   ...openPoseLimbs.flatMap(([a,b],i)=>drawable(a)&&drawable(b)?[`<line x1="${p[a].x*width}" y1="${p[a].y*height}" x2="${p[b].x*width}" y2="${p[b].y*height}" stroke="${colors[i]}" stroke-width="5" stroke-linecap="round"/>`]:[]),
   ...p.flatMap((q,i)=>drawable(i)?[`<circle cx="${q.x*width}" cy="${q.y*height}" r="4" fill="${colors[i%colors.length]}"/>`]:[])
  ];
 });
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden"><rect width="100%" height="100%" fill="black"/>${parts.join("")}</svg>`;
}
export function renderPreviewV3(people:PosePoint[][],visibility:VisibilityV3[][],width:number,height:number,title:string){return renderControlOpenPoseV3(people,visibility,width,height).replace("fill=\"black\"","fill=\"#111827\"").replace("</svg>",`<text x="16" y="28" fill="white" font-size="16">${title.replace(/[<>]/g,"")}</text></svg>`)}
