export type MechanismPoint={x:number;y:number};
export type MechanismGeometry={modelVersion?:'action-mechanism-1';actionId?:string;phase?:string;objectCount?:number;controlShape?:'panel'|'button'|'knob'|'pen'|'pencil'|'brush'|'scissors'|'knife'|'keyboard'|'hammer'|'wrench'|'screwdriver'|'pliers'|'box';baseCenter?:MechanismPoint;extent?:{width:number;height:number};pivot?:MechanismPoint;hingeSide?:'left'|'right';angle?:number;travel?:number;progress?:number;gripPoint?:MechanismPoint;depthAssumption?:string;outline?:Array<{points:MechanismPoint[];role:string;closed:boolean}>;mechanism?:string;axis?:MechanismPoint;objectCenter?:MechanismPoint;workPoint?:MechanismPoint;toolEnd?:MechanismPoint;toolEndLocked?:boolean;supportY?:number;stateBefore?:string;stateAfter?:string;source?:string;assumptions?:string[]};
export function resolveActionMechanism<T extends MechanismGeometry>(input:T,phase?:string):T;
export function actionOutlineBounds(geometry?:MechanismGeometry):{x:number;y:number;width:number;height:number}|null;
export function actionOutlineMarkup(geometry:MechanismGeometry|undefined,width:number,height:number):string;
export function propGroupOutline(relation:{expectedCount?:number;shape?:string},center:MechanismPoint,width:number,height:number):MechanismGeometry|null;
export function mechanismGeometryFailures(geometry?:MechanismGeometry):string[];
export function mechanismPromptTerms(geometry?:MechanismGeometry):string[];
export function relocateActionGeometry<T extends MechanismGeometry>(geometry:T,target:MechanismPoint):T;
