export function actionStageState(actionId:string,phase?:string,supportState?:string):{actionId:string;phase:string;contactState:'approach'|'released'|'contact';contactRequired:boolean;objectState:string};
export function relationActionState(relation:any):ReturnType<typeof actionStageState>|null;
export function actionStageVerb(actionId:string,phase?:string):string;
export function actionStageObjectTerms(actionId:string,phase?:string):string[];
export function contactPassAllowed(relation?:any):boolean;
export function phaseInteractionTerms(relation:{positive?:string[];actionRelationAudit?:{contactState:string}}):string[];

export function synchronizedActionTerms(relation:any):string[];

export function actionContactTerms(relation:any):string[];
