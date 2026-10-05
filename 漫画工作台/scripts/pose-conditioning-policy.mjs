const finite=(v,f)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** One policy for preview, saved recipe and actual ControlNet unit. */
export function poseConditioningPolicy(base={},people=[],preference={}) {
 const strength=['auto','flexible','strict'].includes(preference.strength)?preference.strength:'auto';
 const contact=people.some(p=>p.relationTargets?.length||p.actionContacts?.length);
 const paired=people.length>1;
 const nominal=strength==='strict'?1:strength==='flexible'?((contact||paired)? 0.65:.5):((contact||paired)? 0.82:Math.min(.72,finite(base.weight,.7)));
 const weight=clamp(finite(preference.weight,nominal),0,2);
 const end=strength==='strict'? 0.92:strength==='flexible'? 0.65:Math.min(.8,finite(base.guidanceEnd,.76));
 return {...base,policyVersion:'pose-conditioning-2',strength,weight,guidanceStart:0,guidanceEnd:clamp(finite(preference.guidanceEnd,end),0,1),controlMode:strength==='strict'?'ControlNet is more important':strength==='flexible'?'My prompt is more important':'Balanced',reason:'手动权重与控制结束时点优先，自动档位仅提供默认值'};
}
export function poseUnitParameters(control={}) {
 // Historical recipes have no policy version; preserve their declared numbers.
 const end=clamp(finite(control.guidanceEnd,.82),0,1);
 return {weight:clamp(finite(control.weight,.9),0,2),guidance_start:clamp(finite(control.guidanceStart,0),0,end),guidance_end:end,control_mode:['Balanced','My prompt is more important','ControlNet is more important'].includes(control.controlMode)?control.controlMode:'ControlNet is more important'};
}
