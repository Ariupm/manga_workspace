import type { PoseControlOverrideV1, PosePoint, PoseGazeTarget } from '../pose-v2';
import type { PoseScenePlanV3 } from './schema';
import type { ActionGeometryInput } from './action-relations';

export type PropPosition = NonNullable<PoseControlOverrideV1['propPositions']>[number];
const shift = <T extends PosePoint>(point: T, delta: PosePoint): T => ({ ...point, x: point.x + delta.x, y: point.y + delta.y });

/** Move physical instances, leaving bones, camera and unrelated environment fixed. */
export function movePoseProps(plan: PoseScenePlanV3, positions: PropPosition[]): PoseScenePlanV3 {
  const result = structuredClone(plan);
  const deltas = new Map<string, PosePoint>();
  for (const edit of positions) {
    const relation = plan.relations.find(r => r.objectInstanceId === edit.objectInstanceId);
    if (!relation) throw new Error(`道具已不在当前姿态中，请重新打开编辑器：${edit.objectInstanceId}`);
    if (!Number.isFinite(edit.center.x) || !Number.isFinite(edit.center.y)) throw new Error('道具位置必须是有限坐标。');
    deltas.set(edit.objectInstanceId, { x: edit.center.x - relation.objectCenter.x, y: edit.center.y - relation.objectCenter.y });
  }
  const relationDelta = new Map(plan.relations.map(r => [r.relationId, deltas.get(r.objectInstanceId)]));
  const targetDelta = (id?: string | null) => id ? deltas.get(id) || [...deltas].sort(([a],[b])=>b.length-a.length).find(([key]) => id.startsWith(`${key}:`))?.[1] : undefined;
  const gaze = (g: PoseGazeTarget, own?: PosePoint): PoseGazeTarget => {
    const delta = targetDelta(g.targetId) || (g.source !== 'structured.external_object' && ['object', 'work_point'].includes(g.kind) ? own : undefined);
    return delta && g.point ? { ...g, point: shift(g.point, delta) } : g;
  };
  const geometry = (g: ActionGeometryInput | undefined, own?: PosePoint): ActionGeometryInput | undefined => {
    if (!g) return g;
    const next = structuredClone(g);
    if (own) {
      for (const key of ['baseCenter', 'pivot', 'gripPoint', 'objectCenter', 'toolEnd'] as const) if (next[key]) next[key] = shift(next[key]!, own);
      next.outline = next.outline?.map(o => ({ ...o, points: o.points.map(p => shift(p, own)) }));
    }
    // A bound work surface and mouth/support planes belong to other objects/the body.
    const workDelta = g.workTargetId ? targetDelta(g.workTargetId) : own;
    if (next.workPoint && workDelta) next.workPoint = shift(next.workPoint, workDelta);
    next.source = own ? 'manual_prop_position' : next.source;
    return next;
  };
  const audit = (a: PoseScenePlanV3['people'][number]['actionRelationAudit'], delta?: PosePoint) => a && ({
    ...a, geometry: geometry(a.geometry, delta), handTargets: a.handTargets.map(p => delta ? shift(p, delta) : p),
  });
  for (const r of result.relations) {
    const delta = deltas.get(r.objectInstanceId);
    if (delta) {
      r.objectCenter = shift(r.objectCenter, delta);
      r.contactAnchors = r.contactAnchors?.map(p => shift(p, delta));
      r.geometrySource = 'manual_prop_position';
    }
    const movedGaze = r.gazeTarget && gaze(r.gazeTarget, delta);
    if (movedGaze !== r.gazeTarget || targetDelta(r.actionPlan?.geometry.workTargetId)) r.geometrySource = 'manual_prop_position';
    if (movedGaze) r.gazeTarget = movedGaze;
    r.actionRelationAudit = audit(r.actionRelationAudit, delta);
    if (r.actionPlan) r.actionPlan = { ...r.actionPlan, geometry: geometry(r.actionPlan.geometry, delta)! };
  }
  for (const person of result.people) {
    const primary = person.relationTargets.find(r => r.actionRelationAudit) || person.relationTargets[0];
    const delta = primary?.relationId ? relationDelta.get(primary.relationId) : undefined;
    person.actionGeometryInput = geometry(person.actionGeometryInput, delta);
    person.actionRelationAudit = audit(person.actionRelationAudit, delta);
    if (delta && person.target) person.target = shift(person.target, delta);
    person.gazeTarget = gaze(person.gazeTarget, delta);
    if (person.headDirection && person.gazeTarget.point) {
      person.headDirection.target = { ...person.gazeTarget.point };
      const nose = result.fullPeople[result.people.indexOf(person)]?.[0];
      if (nose) { person.headDirection.dx = person.gazeTarget.point.x - nose.x; person.headDirection.dy = person.gazeTarget.point.y - nose.y; }
    }
    for (const r of person.relationTargets) {
      const d = r.relationId ? relationDelta.get(r.relationId) : undefined;
      if (d) {
        r.target = shift(r.target, d);
        r.contactAnchors = r.contactAnchors?.map(p => shift(p, d));
        r.wristAssignments = undefined; // Actual wrists stay in fullPeople.
      }
      r.gazeTarget = gaze(r.gazeTarget, d);
      r.actionRelationAudit = audit(r.actionRelationAudit, d);
      if (r.actionPlan) r.actionPlan = { ...r.actionPlan, geometry: geometry(r.actionPlan.geometry, d)! };
    }
    for (const arm of person.overlayAudit?.arms || []) {
      const d = arm.relationId ? relationDelta.get(arm.relationId) : undefined;
      if (d) arm.target = shift(arm.target, d);
    }
    for (const contact of person.actionContacts || []) {
      const d = relationDelta.get(contact.relationId);
      if (d) contact.target = shift(contact.target, d);
    }
  }
  for (const e of result.evidence) {
    const delta = e.relationId ? relationDelta.get(e.relationId) : undefined;
    if (delta) e.points = e.points?.map(p => shift(p, delta));
  }
  if (result.interactionTarget) {
    const shared = plan.relations.find(r => plan.relations.some(other => other.objectInstanceId === r.objectInstanceId && other.characterId !== r.characterId)
      && Math.hypot(r.objectCenter.x-result.interactionTarget!.x,r.objectCenter.y-result.interactionTarget!.y)<1e-6);
    const delta = shared && deltas.get(shared.objectInstanceId);
    if (delta) result.interactionTarget = shift(result.interactionTarget, delta);
  }
  return result;
}
