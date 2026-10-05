export function usesPoseGeometry(recipe?:any):boolean;
export function referenceRegionPlan(recipe:any,reference:any):{shape:string;region:{xStart:number;xEnd:number};source:string;bounds:{x:number;y:number;width:number;height:number};normalizedBounds:{x:number;y:number;width:number;height:number}}|null;
export function poseUsagePlan(enabled?:boolean):{version:'pose-usage-1';enabled:boolean;status:string;geometryDependentPasses:string;identityReference:string;referenceRegionVersion:'authored-region-1'};
export function assertControlPolicyRequest(recipe:any,payload:any,context:{stage:string}):void;

export function usesReferenceImages(recipe?:any):boolean;
export function referenceImageUsagePlan(enabled?:boolean):{version:'reference-images-1';enabled:boolean;status:string};
export function activeReferenceImages<T>(recipe:any,references?:T[]):T[];
