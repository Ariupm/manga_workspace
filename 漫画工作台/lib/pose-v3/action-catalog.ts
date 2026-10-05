import type {PoseActionFamilyV2} from '../pose-v2';
/** Explicit template semantics shared by registry, recognition and manual overrides. */
export const extraActionsV3:Record<string,{label:string;family:PoseActionFamilyV2;pattern:RegExp;prompt:string}>={
 turn:{label:'转身',family:'turn',pattern:/\bturn(?:ing)? (?:around|back|the body)|转身|回身/i,prompt:'turning the torso'},
 bend:{label:'弯腰',family:'bend',pattern:/\bbend(?:ing)? (?:down|forward)|弯腰|俯身/i,prompt:'bending forward at the hips'},
 point:{label:'指向',family:'point',pattern:/\bpoint(?:ing)?(?: at| toward| to)|指向|指着/i,prompt:'pointing toward the target'},
 reach:{label:'伸手',family:'reach',pattern:/\breach(?:ing)?(?: for| toward| out)|伸手|探手/i,prompt:'reaching toward the target'},
 self_touch:{label:'触碰头部',family:'self_touch',pattern:/touch(?:ing)? (?:the |her |his )?(?:head|face)|摸头|摸脸|扶额/i,prompt:'touching the side of the head'},
 nod:{label:'低头／点头姿态',family:'head_gesture',pattern:/\bnod(?:ding|s)?\b|lower(?:ing)? (?:the |her |his )?head|点头|低头/i,prompt:'head inclined downward'},
 look_up:{label:'抬头',family:'head_gesture',pattern:/look(?:ing)? up|rais(?:e|ing) (?:the |her |his )?head|抬头|仰头/i,prompt:'head tilted upward'},
 head_turn:{label:'转头／回头',family:'head_gesture',pattern:/turn(?:ing)? (?:the |her |his )?head|look(?:ing)? back|转头|回头|摇头/i,prompt:'head turned sideways'},
 head_tilt:{label:'歪头',family:'head_gesture',pattern:/tilt(?:ing)? (?:the |her |his )?head|歪头/i,prompt:'head tilted to the side'},
 open:{label:'打开',family:'open_close',pattern:/\b(?:opening|opens)\b|^\s*open\s+|打开|掀开/i,prompt:'opening the declared object'},
 close:{label:'关闭',family:'open_close',pattern:/\bclos(?:e|ing|es) (?:the |a )?(?:door|window|box|lid)|关门|关窗|合上/i,prompt:'closing the declared object'},
 operate_environment:{label:'操作环境物体',family:'operate_environment',pattern:/press(?:ing)? (?:a |the )?(?:button|switch)|turn(?:ing)? (?:a |the )?(?:knob|handle)|按按钮|按开关|转动把手/i,prompt:'operating the declared environmental object'},
 write:{label:'书写',family:'write_tool',pattern:/\bwrit(?:e|ing)|\bcopying\b|书写|写字|抄写/i,prompt:'writing at the work surface'},
 tool:{label:'使用工具',family:'write_tool',pattern:/\b(?:cutting|slicing|typing|drawing|using a tool)\b|剪切|切菜|打字|绘画|使用工具/i,prompt:'using the declared tool at the work point'},
 drink:{label:'饮水',family:'drink_eat',pattern:/\bdrink(?:ing|s)?\b|喝水|饮水|喝茶/i,prompt:'bringing the drink to the mouth'},
 eat:{label:'进食',family:'drink_eat',pattern:/\beat(?:ing|s)?\b|吃饭|进食|吃东西/i,prompt:'bringing food toward the mouth'},
};
export function extraTemplateFromText(text:string){
 const positive=text.replace(/\b(?:not|never|without)\s+\w+(?:ing)?\b/gi,'').replace(/(?:不|不要|没有)(?:点头|低头|抬头|转头|回头|歪头|伸手|弯腰|喝水|吃饭)/g,'');
 return Object.entries(extraActionsV3).find(([,a])=>a.pattern.test(positive))?.[0];
}
export function pairTemplateV3(kind:string|null,text:string){
 if(kind==='handshake_highfive')return /high.?five|击掌/i.test(text)?'highfive':'handshake';
 if(kind==='embrace_support')return /support|扶|搀/i.test(text)?'support_walk':'embrace';
 return kind&&['handover','conversation','reaction','shared_prop','guide_pull','walk_together','confrontation'].includes(kind)?kind:null;
}
export const pairTemplateIdsV3=['handover','handshake','highfive','embrace','support_walk','conversation','reaction','shared_prop','guide_pull','walk_together','confrontation'];
