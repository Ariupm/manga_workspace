export function propBodySizePlan(input?: {
  propSizeHint?: {version:string;coordinateSpace:string;width?:number;height?:number};
  shape?: string; orientation?: string; contactSpan?: number;
  hasPoseContact?: boolean; regionWidth?: number;
}): { width: number; height: number; envelope: { width: number; height: number } };
export function deferRequiredPropsFromBasePrompt(prompt?:string,interactions?:any[],options?:{structuredVisual?:boolean}):{prompt:string;removed:string[];objects:string[];negative?:string};
export function upperBodyVisiblePrompt(prompt?:string,options?:{suppressForegroundClutter?:boolean;raisedHandContact?:boolean;structuredVisual?:boolean}):string;

export function relationGazeDescription(relation:any,relations?:any[]):string;
export function isLastRelationGaze(relation:any,relations?:any[]):boolean;
export function propPhysicalAppearance(interaction?:any):string;

export function gazeRefinementPrompt(options?:any):string;
export function appearanceControlCoverage(references:any[],characterIds:string[]):Array<{characterId:string;face:string;hair:string;outfit:string;detail:string}>;
