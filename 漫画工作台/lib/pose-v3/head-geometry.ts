import type {PosePoint} from '../pose-v2';
/** Pitch/yaw/roll change the face frame, rather than translating an intact front face. */
export function orientHeadV3(p:PosePoint[],pitch:number,yaw:number,roll=0,mirror=false){
 const sign=mirror?-1:1,neck=p[1];
 const center={x:neck.x+Math.sin(yaw)*.04*sign,y:neck.y-.105+pitch*.038};
 p[0]={x:center.x+Math.sin(yaw)*.025*sign,y:center.y+pitch*.018};
 for(const [j,side,width] of [[14,-1,.025],[15,1,.025],[16,-1,.045],[17,1,.045]]){
  const x=side*width*Math.cos(yaw)*sign;
  const y=-.01+(j>=16?-pitch*.014:-pitch*.002)+side*Math.sin(yaw)*.006;
  p[j]={x:center.x+x*Math.cos(roll)-y*Math.sin(roll),y:center.y+x*Math.sin(roll)+y*Math.cos(roll)};
 }
}
export function aimHeadV3(p:PosePoint[],target:PosePoint,mirror=false){
 const dx=target.x-p[1].x,dy=target.y-(p[1].y-.105);
 orientHeadV3(p,Math.max(-.8,Math.min(.8,dy*2)),Math.max(-.8,Math.min(.8,dx*2))*(mirror?-1:1),0,mirror);
}
