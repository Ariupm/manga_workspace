import {positivePoseText} from './pose-basic-semantics';
export function positiveActionText(text:string){
 const s=positivePoseText(text).toLowerCase().replace(/\b(?:not|never|without)\s+(?:(?:currently|actually)\s+)?(?:reaching|reach|placing|putting|picking\s+up|taking|lifting|opening|closing|pressing|turning|rotating|pushing|pulling)\b[^,;.]*/g,' ').replace(/(?:不|不要|没有)(?:伸手去拿|伸手拿|伸手取|放下|放置|拿起|取出|打开|关闭|推动|拉动|按按钮|转动旋钮)/g,'');
 return s;
}
export function actionIntent(text:string){
 const s=positiveActionText(text);
 if(/\b(?:plac(?:e|ing|ed)|put(?:ting)?|set(?:ting)? down)\b|放下|放置|摆放/.test(s))return 'place';
 if(/\breach(?:ing)?\s+(?:for|towards?|to)\b|伸手(?:去|准备|想要)?(?:拿|取|够)|伸手.*(?:拿取|取件)/.test(s))return 'reach';
 if(/\b(?:pick(?:ing|ed)? up|tak(?:e|ing|en)|lift(?:ing)?)\b|拿起|取出|拿到|取到/.test(s))return 'pick';
 if(/\b(?:opening|unfolding)\b|^\s*(?:open|unfold)\s+|打开|掀开/.test(s))return 'open';
 if(/\b(?:closing|shutting)\b|^\s*(?:close|shut)\s+|关闭|关门|关窗|合上/.test(s))return 'close';
 if(/(?:turn(?:ing)?|rotat(?:e|ing))\s+(?:(?:a|the)\s+)?(?:knob|handle)|press(?:ing)? .*?(?:button|switch)|按按钮|按开关|转动把手|(?:旋转|转动|拧).*旋钮/.test(s))return 'operate_environment';
 if(/\bpush(?:ing)?\b|推动/.test(s))return 'push';
 if(/\bpull(?:ing)?\b|拉动/.test(s))return 'pull';
 return null;
}
export function explicitHandMode(text:string):'one'|'two'|null {
 const s=positivePoseText(text).toLowerCase();
 if(/\b(?:both|two)\s+(?:visible\s+)?hands?\b|双手|两只手/.test(s))return 'two';
 if(/\b(?:(?:one|single)\s+hand|(?:left|right)\s+hand)\b|单手|一只手|左手|右手/.test(s))return 'one';
 return null;
}
