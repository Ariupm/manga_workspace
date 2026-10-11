import type {PosePhase} from './pose-v2';

/** Scene time is not evidence of an action-state transition. */
export function explicitStoryPhase(text:string):PosePhase|undefined{
 const transition='(?:contact|(?:the )?action|(?:pick(?:ing)? up|plac(?:e|ing)|putting|open(?:ing)?|clos(?:e|ing)|releas(?:e|ing)|touch(?:ing)?|grasp(?:ing)?))\\b';
 if(/\b(?:anticipation|prepar(?:e|ing|ation)|about to|pre[-_ ]contact)\b|准备|将要|尚未|接近/i.test(text)||/^\s*before\s*$/i.test(text)||new RegExp('\\bbefore\\s+'+transition,'i').test(text))return 'anticipation';
 if(/\b(?:follow[-_ ]?through|finished|completed|released|picked up)\b|已经|完成|松开|放好|关好|打开后|拿到|取到/i.test(text)||/^\s*after\s*$/i.test(text)||new RegExp('\\bafter\\s+'+transition,'i').test(text))return 'follow_through';
 if(/\bcontact\b|接触|抓住/i.test(text))return 'contact';
 return undefined;
}
