import {actionOutlineBounds} from './action-mechanism.mjs';
import {contactPassAllowed} from './action-stage-policy.mjs';
import {propBodySizePlan} from './sd-worker-logic.mjs';
export function propInteractionGeometry(interaction, posePeople = [], characterIndex = 0, width = 512, height = 512, posePlans = []) {
  const actionGeometry=interaction.actionRelationAudit?.geometry || interaction.actionPlan?.geometry;
  const center = actionGeometry?.objectCenter || interaction.objectCenter || { x: .5, y: .58 };
  const pose = posePeople[characterIndex] || [];
  const plannedRelation = posePlans[characterIndex]?.relationTargets?.find((relation) => relation.relationId === interaction.relationId) || null;
  const anchors = Array.isArray(interaction.contactAnchors) && interaction.contactAnchors.length
    ? interaction.contactAnchors
    : interaction.handMode === "two"
      ? [{ hand: "left", x: center.x + .055, y: center.y, role: "support" }, { hand: "right", x: center.x - .055, y: center.y, role: "active" }]
      : [{ hand: "right", x: center.x, y: center.y, role: "active" }];
  const poseContacts = anchors.map((anchor) => {
    if(interaction.actionRelationAudit||interaction.geometrySource==='manual_prop_position'||actionGeometry?.source==='coupled_work_layout')return {...anchor,source:"authored_action_contact"};
    if (plannedRelation) {
      const assignment = plannedRelation.wristAssignments?.find((item) => item.hand === anchor.hand)
        || plannedRelation.contactAnchors?.find((item) => item.hand === anchor.hand);
      if (assignment && Number.isFinite(assignment.x) && Number.isFinite(assignment.y))
        return { ...anchor, x: assignment.x, y: assignment.y, source: "relation_wrist_assignment" };
    }
    const index = anchor.hand === "left" ? 7 : 4;
    return pose[index] && Number.isFinite(pose[index].x) ? { ...anchor, x: pose[index].x, y: pose[index].y, source: "pose_wrist" } : { ...anchor, source: "contract_anchor" };
  });
  const minX = Math.min(center.x, ...poseContacts.map((point) => point.x));
  const maxX = Math.max(center.x, ...poseContacts.map((point) => point.x));
  const minY = Math.min(center.y, ...poseContacts.map((point) => point.y));
  const maxY = Math.max(center.y, ...poseContacts.map((point) => point.y));
  const regionWidth = Math.max(.12, (interaction.region?.xEnd ?? 1) - (interaction.region?.xStart ?? 0));
  const hasPoseContact = contactPassAllowed(interaction) && poseContacts.some((point) => point.source === "pose_wrist" || point.source === "relation_wrist_assignment" || point.source === "authored_action_contact");
  const wristSpan = Math.max(0, maxX - minX);
  const bodySize = propBodySizePlan({ shape: interaction.shape, orientation: interaction.orientation, contactSpan: wristSpan, hasPoseContact, regionWidth, propSizeHint:interaction.propSizeHint });
  const declaredBounds=actionOutlineBounds(actionGeometry);
  if(declaredBounds){bodySize.width=2*Math.max(center.x-declaredBounds.x,declaredBounds.x+declaredBounds.width-center.x);bodySize.height=2*Math.max(center.y-declaredBounds.y,declaredBounds.y+declaredBounds.height-center.y);bodySize.envelope={width:bodySize.width,height:bodySize.height};}
  const widthRatio = bodySize.envelope.width;
  const heightRatio = bodySize.envelope.height;
  return {
    center,actionGeometry,
    contacts: poseContacts,
    bounds: {
      x: Math.min(minX, center.x - widthRatio * .5),
      y: Math.min(minY, center.y - heightRatio * .5),
      width: Math.max(maxX, center.x + widthRatio * .5) - Math.min(minX, center.x - widthRatio * .5),
      height: Math.max(maxY, center.y + heightRatio * .5) - Math.min(minY, center.y - heightRatio * .5),
    },
    bodySize: { width: bodySize.width, height: bodySize.height, envelope: bodySize.envelope },
    depthPlane: interaction.surfacePlan?.plane === "screen" ? "character_facing_surface" : "action_plane",
    occlusionOrder: "hands_in_front_at_declared_contact_anchors_object_continuous_behind_contacts",
    source: hasPoseContact ? "pose_wrist_or_relation_target_plan_plus_contract_surface" : "contract_anchors_plus_region_fallback",
  };
}
