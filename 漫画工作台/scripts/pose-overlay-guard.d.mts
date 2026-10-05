import type {PosePoint} from '../lib/pose-v2';
import type {PosePersonSemanticV3} from '../lib/pose-v3/schema';
export function forearmsIntersect(people:PosePoint[]):boolean;
export function overlayGeometryFailures(people:PosePoint[][],plans:PosePersonSemanticV3[]):string[];
