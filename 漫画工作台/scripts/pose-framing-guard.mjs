export function upperTorsoFramingFailures(projected,composition){
 if(!['head_shoulders','chest_action'].includes(composition))return [];
 const visible=p=>p.x>=.02&&p.x<=.98&&p.y>=.02&&p.y<=.98;
 return projected.some(p=>{if(!p[1]||!p[8]||!p[11])return false;const hip={x:(p[8].x+p[11].x)/2,y:(p[8].y+p[11].y)/2};const boundary=composition==='head_shoulders'?{x:p[1].x+(hip.x-p[1].x)*.55,y:p[1].y+(hip.y-p[1].y)*.55}:hip;return visible(boundary);})?[`requested ${composition} crop includes torso below its framing boundary`]:[];
}
