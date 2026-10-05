export function propBodySizePlan(input?: {
  shape?: string; orientation?: string; contactSpan?: number;
  hasPoseContact?: boolean; regionWidth?: number;
}): { width: number; height: number; envelope: { width: number; height: number } };
export function deferRequiredPropsFromBasePrompt(prompt?:string,interactions?:any[],options?:{structuredVisual?:boolean}):{prompt:string;removed:string[];objects:string[];negative?:string};
export function upperBodyVisiblePrompt(prompt?:string,options?:{suppressForegroundClutter?:boolean;raisedHandContact?:boolean;structuredVisual?:boolean}):string;
